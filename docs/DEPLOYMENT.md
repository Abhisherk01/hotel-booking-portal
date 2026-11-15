# Deployment Guide

This document describes how to build, configure and run the Hotel Booking
Portal outside a developer laptop, in a platform-neutral way. It follows the
same discipline as the rest of the documentation: it states only what the
application does today, separates that from what a deployment operator must
provide themselves, and lists what is explicitly not built yet.

A green CI run is not a production-readiness statement. CI proves the build,
the 83-test suite and the frontend build pass; it does not provision
infrastructure, add authentication, or operate a database. Sections marked
**Operator responsibility** describe work the deployment platform is expected
to own.

---

## 1. Runtime prerequisites

| Component | Version | Notes |
|---|---|---|
| Java | 21 | The build targets `--release 21` (`backend/pom.xml`); CI runs Temurin 21. |
| Maven | 3.9.9 | Not installed manually - the wrapper (`./mvnw`) downloads exactly 3.9.9 on first use. |
| Node.js | 20.x | CI pins Node 20 for the frontend; the documented target is Node 20+. |
| npm | 10+ | Ships with Node 20; the repo carries `package-lock.json` for reproducible installs. |
| MySQL | 8.4 | The tested engine (`mysql:8.4`); the MySQL leg of the suite is green in CI at `cd6ed12` and was verified locally on MySQL 8.4.13. |

The default `h2` profile is a development convenience (embedded H2 file
database). It must not serve a production deployment; production always runs
the MySQL profile (section 5).

## 2. Frontend build

```bash
cd frontend
npm ci               # clean, lockfile-exact install (CI does the same)
npm run build        # tsc -b && vite build
```

The production bundle lands in `frontend/dist/`. Serve it from any static
host, with two expectations:

- **SPA fallback:** the app is a React Router SPA (`/`, collection, hotel
  detail, `/manage-booking`, `/styleguide`). Configure the host to serve
  `index.html` for unknown paths so deep links and refreshes work.
- **`/styleguide` ships in the bundle.** It is the design-system reference
  page. Leave it public or remove the route before an external launch - it
  is documentation, not product surface.

Before every release, run `npm audit --omit=dev` (the CI frontend job runs
it as a blocking step since the Phase 4 hardening). The audit covers
production dependencies only, per npm's own exit status.

## 3. Frontend API base URL configuration

`frontend/src/api/client.ts` resolves the API base once:

- **Default (same-origin):** `VITE_API_BASE_URL` unset means the client
  calls relative `/api` paths. Serve the static bundle on the same origin
  as the API's reverse proxy and no CORS or base URL work is needed.
- **Cross-origin deployments:** set `VITE_API_BASE_URL` at *build* time to
  the API origin (e.g. `https://api.example.com`), because `import.meta.env`
  values are baked into the bundle. The API origin must then be added to the
  backend's `CORS_ALLOWED_ORIGINS` (section 7) or the browser will reject
  every response.

The Vite dev/preview proxies (`/api` to `localhost:8080` on ports 5173/4173)
exist for local work only and play no role in production.

## 4. Backend build and run

```bash
cd backend
./mvnw clean verify            # tests run, then the executable JAR is packaged
java -jar target/hotel-booking-api-0.1.0.jar
```

- `clean verify` runs Maven's complete verification lifecycle: sources
  compile, the full 83-test suite runs, and the packaging phase then
  produces the executable JAR - so one command both proves and packages
  the build. A failing suite stops the build before anything is packaged.
- The Spring Boot Maven plugin produces the executable fat jar
  `target/hotel-booking-api-0.1.0.jar` during that packaging phase.
- The API listens on `SERVER_PORT` (default `8080`) and serves plain HTTP;
  TLS is terminated upstream (section 8).
- If a build must skip nothing, skip nothing: there is no supported
  `-DskipTests` deployment path in this project's process.

## 5. MySQL profile activation and database connection

Activation is one variable: `SPRING_PROFILES_ACTIVE=mysql`. Without it the
application boots the H2 development profile - which is exactly the failure
mode the Phase 4 hardening defends against, and the first thing to check if
a deployment "boots but has no data".

Connection settings come from the environment only; no default password
exists anywhere in the repository (`application-mysql.yml` resolves every
value from a variable):

| Variable | Role | Notes |
|---|---|---|
| `DB_HOST` | Database host | optional override, default `localhost` (e.g. a managed-database endpoint or `127.0.0.1`) |
| `DB_PORT` | Database port | optional override, default `3306` |
| `DB_NAME` | Database name | optional override, default `hotel_booking` |
| `DB_USERNAME` | Application user | optional override, default `hotel_app` |
| `DB_PASSWORD` | Password | **no default - must be provided** |

The configured user needs DDL rights in the target schema: Flyway owns the
schema and applies migrations at boot (`db/migration/V1`-`V3` today), while
Hibernate runs with `ddl-auto: none` and can never create or alter tables.
A failed migration leaves a `flyway_schema_history` row with
`success = 0` and the API refuses to boot until it is resolved - that is
deliberate fail-safe behaviour, not a bug to restart away.

## 6. Production environment variables

Consolidated view for a production shell / process manager:

| Variable | Status | Purpose |
|---|---|---|
| `SPRING_PROFILES_ACTIVE` | required | Must be `mysql` in production; the alternative default is the H2 development profile. |
| `DB_HOST` | optional override | Default `localhost` (section 5). |
| `DB_PORT` | optional override | Default `3306` (section 5). |
| `DB_NAME` | optional override | Default `hotel_booking` (section 5). |
| `DB_USERNAME` | optional override | Default `hotel_app` (section 5). |
| `DB_PASSWORD` | required | Database credential; no default exists. |
| `CORS_ALLOWED_ORIGINS` | required in production | Has localhost-only defaults (`localhost:3000`, `localhost:5173`); production must explicitly set the real frontend origins (section 7). |
| `VITE_API_BASE_URL` | conditional, build-time | Only when the frontend and the API are served from different origins (section 3). |
| `SERVER_PORT` | optional | Backend listen port, default `8080`. |
| `APP_RATE_LIMIT_ENABLED` | situational | Set `false` behind an authoritative gateway (section 11). |
| `H2_CONSOLE_ENABLED` | leave unset | Dev-only switch; a production environment must never set it `true` (section 13). |

Rate-limit ceilings (`app.rate-limit.*` in `application.yml`: create,
lookup, cancel 10 and quote 30 per 60-second window) are policy values in
configuration, not code, so an environment can tune them through Spring's
standard externalized configuration; `APP_RATE_LIMIT_ENABLED` is the
documented on/off switch.

## 7. CORS configuration

The API enforces an exact-origin allowlist on `/api/**`
(`backend/src/main/java/com/hotelbooking/config/CorsConfig.java`):

- Origins come from `CORS_ALLOWED_ORIGINS`, comma-separated, each an exact
  scheme + host + port match (e.g.
  `https://staging.example,https://www.example`). The defaults cover only
  `localhost:3000` and `localhost:5173` development origins.
- There is no wildcard and no origin reflection, and credentials are not
  allowed - list every real origin explicitly.
- Unknown origins are rejected (`403 Invalid CORS request`) before any
  controller runs.
- The filter is registered on `/api/**` only; actuator and OpenAPI paths
  are outside the CORS guard, which is one more reason to gate them at the
  proxy (section 9).

**Operator responsibility:** keep the list minimal, update it when the
public origin changes, and remember browsers do not check CORS for
server-side clients - it protects browsers, not the API itself.

## 8. HTTPS / TLS expectations

The application itself speaks plain HTTP on its listen port and contains no
TLS configuration. The expected production topology is:

- A reverse proxy or load balancer terminates TLS (certificate, renewal,
  cipher policy) and forwards plain HTTP to `SERVER_PORT` on a private
  network.
- The proxy enforces HTTP-to-HTTPS redirection and may add HSTS.
- The application sets no cookies and holds no sessions (there is no
  authentication), so there are no secure-cookie obligations today.

TLS is an operator responsibility in this architecture; nothing in the
codebase needs to change to sit behind a TLS-terminating proxy.

## 9. Reverse proxy / API gateway topology

The recommended production shape:

```
browser -- TLS --> reverse proxy --+--> static files: frontend/dist/
                                   +--> proxy /api/* --> backend :8080
```

**Operator responsibility** at the proxy:

- Serve `frontend/dist/` with SPA fallback (section 2) and route `/api/*`
  to the backend.
- **Block or restrict the development surfaces** before a public launch:
  `/swagger-ui.html`, `/v3/api-docs` (springdoc, dev convenience only) and
  everything under `/actuator/` except `/actuator/health`. The application
  has no authentication layer (no Spring Security exists), so these paths
  are unauthenticated by design today - the proxy is the only gate.
- Do not rely on `X-Forwarded-For`-style behaviour inside the app: the rate
  limiter deliberately keys on the TCP peer address
  (`request.getRemoteAddr()`), so behind a proxy every client shares one
  source address. That is exactly why the in-app limiter should be disabled
  behind a gateway (section 11).

## 10. Health-check considerations

- `GET /actuator/health` returns `{"status":"UP"}` and is the intended
  liveness/readiness probe for a load balancer or process supervisor.
- `/actuator/info` is exposed alongside it; details and components are
  configured to `never`, so the endpoints reveal no internals.
- **Actuator exposure must be reviewed before any public production
  deployment.** Today only `health,info` are included
  (`management.endpoints.web.exposure.include`), but the exposure set and
  who can reach them (proxy rules, section 9) must be a conscious
  deployment decision, not a default.

## 11. Rate-limiting responsibilities

What the application implements today (Phase 3):

- A single-instance, in-memory, fixed-window throttle on the four booking
  endpoints (`POST /api/bookings`, `/lookup`, `/price-quote`,
  `.../cancel`): create, lookup and cancel 10 requests, quote 30, per
  60-second window, per client address + endpoint. Over-budget requests get
  `429 RATE_LIMITED` with a `Retry-After` header and the standard error
  envelope.
- Counters live in one JVM's memory: a second instance keeps its own
  budget, a restart resets every window, and the client identity is the TCP
  peer address - deliberately not `X-Forwarded-For`.

What it is **not**: distributed rate limiting. It is defense-in-depth for a
one-process deployment. **A production gateway or distributed limiter must
be the authoritative rate-limiting layer** (per real client identity,
across instances). A gateway-fronted deployment should set
`APP_RATE_LIMIT_ENABLED=false`, because every client then shares the
gateway's source address and the in-app filter would only throttle one
shared bucket.

## 12. Database backup and migration considerations

- Flyway applies pending migrations automatically at every boot; there is
  no separate migration step to run or forget.
- Never edit an applied migration. Schema changes arrive as new versioned
  files (`V4__...` and onward) so every environment, including a restored
  backup, converges on the same history.
- **Operator responsibility:** take a database backup before every deploy
  (`mysqldump` or the platform's managed snapshots), verify a restore
  periodically, and treat `flyway_schema_history` as part of the schema -
  a backup without it cannot report migration state correctly.
- A failed migration stops the boot (section 5). The recovery order is:
  diagnose, restore the pre-deploy backup if needed, fix forward with a new
  migration - never by editing history.

## 13. Safe handling of secrets and `.env` files

- `backend/.env.example` is the committed template (variable names only,
  `change-me` placeholders). Real `.env` files are git-ignored and must
  never be committed or pasted into issues, PRs or CI logs.
- Docker Compose reads `.env` for the local MySQL profile; the Spring app
  reads the same variables from its process environment. In production,
  prefer the platform's secret manager or process-manager environment
  injection over loose files; when a file is used, keep it `chmod 600`,
  owned by the service account, and outside any directory the web server
  serves.
- This document and the repository contain no real credentials. The CI
  workflow uses disposable CI-only database credentials that hold no
  production value.
- H2 console, verified against the Phase 4 M1 hardening: it defaults to
  disabled everywhere (the fail-safe baseline in `application.yml`), it can
  be explicitly enabled for local development only via
  `H2_CONSOLE_ENABLED=true` (dev profile opt-in), the MySQL profile pins it
  off regardless of the environment, and it must never be enabled in
  production - the console is unauthenticated on the dev profile.

## 14. Production configuration checklist

- [ ] `SPRING_PROFILES_ACTIVE=mysql` on the backend process
- [ ] Real `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USERNAME`, `DB_PASSWORD` injected, no `change-me` values left
- [ ] `CORS_ALLOWED_ORIGINS` lists exactly the public (and staging, if used) origins
- [ ] `VITE_API_BASE_URL` set at build time if the bundle origin differs from the API origin
- [ ] TLS terminated at the proxy; HTTP redirected; HSTS considered
- [ ] Proxy serves `dist/` with SPA fallback and routes `/api/*` to the backend
- [ ] `/swagger-ui.html`, `/v3/api-docs` and non-health `/actuator/*` blocked at the proxy
- [ ] Gateway rate limiting configured and authoritative; `APP_RATE_LIMIT_ENABLED=false` behind it
- [ ] `H2_CONSOLE_ENABLED` unset in every production environment
- [ ] Database backup taken and restore rehearsed before first deploy
- [ ] `npm audit --omit=dev` clean (or findings accepted explicitly) for the release build
- [ ] Log shipping / retention configured (application logs to stdout)

## 15. Current limitations and future production work

What the application deliberately does **not** have today - these are not
deployment flags to find, they are unbuilt features:

- **No authentication or sessions** (no Spring Security): the only guest
  identity is the booking reference + email pair; all actuator and OpenAPI
  endpoints are unauthenticated and must be gated by the proxy.
- **No payment processing, no email delivery, no admin functionality.**
- **No distributed rate limiting** - the in-app limiter is single-instance
  and in-memory only (section 11).
- **No Content-Security-Policy** header: the API serves JSON only; CSP
  belongs with the first HTML-serving or session-bearing surface.
- **No cancel-by cutoff**: a stay whose check-in has passed can still be
  cancelled.
- **No container images for the application**: `backend/docker-compose.yml`
  provisions a local/staging MySQL 8.4 only (loopback-only port binding,
  healthcheck-gated). It is not a production deployment target, and
  backend containerization is future work (Phase 4 M3).
- **No infrastructure-as-code, observability stack or horizontal
  scaling** story yet; the current design assumption is one backend
  instance in front of one MySQL database.

Future production work, in rough order: containerize the backend (M3),
introduce authentication/session security, replace the in-memory limiter
with a distributed one (or make the gateway limiter the sole authority),
add email delivery for booking recovery, define a CSP, and revisit
actuator exposure for the public environment.
