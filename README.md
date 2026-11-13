# Hotel Booking Portal

A full-stack hotel booking application: browse hotels, check date availability, book one room, retrieve and cancel reservations - built as a technical interview assignment.

**Current status:** Phase 1 of 9 complete (backend bootstrap and infrastructure). The REST endpoints, schema migrations and sample data arrive in Phases 2-3; the web client in Phase 5. This README documents only what exists right now.

## Stack (backend)

| Layer | Technology |
|---|---|
| Language | Java 21 (Temurin) |
| Framework | Spring Boot 3.5.16 (Web, Data JPA, Validation, Actuator) |
| Migrations | Flyway |
| Database | H2 (MySQL compatibility mode) for development, MySQL 8.4 for full local runs |
| Build | Maven 3.9 (wrapper included, no local Maven install required) |
| Tests | JUnit 5 + Mockito + Spring Boot Test (wired, written in Phase 4) |

## Repository layout

```
backend/                     Spring Boot REST API (port 8080)
  src/main/java/com/hotelbooking/
    HotelBookingApplication.java
    config/                  CORS allowlist, business timezone clock
  src/main/resources/
    application.yml          shared configuration
    application-h2.yml       default profile - embedded H2, file-persisted
    application-mysql.yml    MySQL profile - credentials from environment only
    db/migration/            Flyway scripts (populated in Phase 2)
  docker-compose.yml         MySQL 8.4 for the local database profile
  .env.example               environment template (copy to .env, never committed)
frontend/                    arrives in Phase 5
```

## Prerequisites

- JDK 21 (`java -version` should report 21.x)
- That is all for the H2 profile - the Maven wrapper downloads Maven itself.
- Docker + Docker Compose, only if you want the MySQL profile.

## Running with H2 (default profile)

```bash
cd backend
./mvnw spring-boot:run
```

On first boot the API compiles, starts on port 8080 and creates `backend/data/hotelbooking.mv.db`. Useful endpoints while the profile is active:

| URL | Purpose |
|---|---|
| `http://localhost:8080/actuator/health` | liveness probe, returns `{"status":"UP"}` |
| `http://localhost:8080/h2-console` | browser SQL console (JDBC URL `jdbc:h2:file:./data/hotelbooking;MODE=MySQL`, user `sa`, empty password) |

The H2 profile exists for quick development. It runs H2 in MySQL compatibility mode so schema SQL and locking behaviour stay portable to MySQL.

## Running with MySQL

```bash
cd backend

# 1. Configure credentials - the compose file refuses to start without them.
cp .env.example .env
# edit .env: set DB_PASSWORD and DB_ROOT_PASSWORD (never commit this file)

# 2. Start MySQL 8.4 and wait for the healthcheck to pass.
docker compose up -d
docker compose ps        # STATUS should be "healthy"

# 3. Boot the API against it.
SPRING_PROFILES_ACTIVE=mysql ./mvnw spring-boot:run
```

Connection details resolve from the environment (`DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USERNAME`, `DB_PASSWORD`). No default password exists anywhere in the repository - if `DB_PASSWORD` is unset the API fails fast rather than guessing.

## Verifying migrations

Flyway is enabled and owns the schema; Hibernate is configured with `ddl-auto: none` and can never create tables.

1. Boot the API with either profile and watch the log for `Creating Schema History table`.
2. Open the H2 console (H2 profile) or any MySQL client and run:

```sql
SELECT version, description, success FROM flyway_schema_history ORDER BY installed_rank;
```

3. Every applied row must show `success = 1`. A failed migration leaves the row with `success = 0` and the API refuses to boot until it is resolved.

`V1__schema.sql` (tables and constraints) and `V2__sample_data.sql` (five seeded hotels) are delivered and verified in Phase 2; the commands above do not change when they land.

## Configuration notes

- **CORS:** browsers may call the API only from origins listed in `app.cors.allowed-origins` (default `http://localhost:3000`, override with `CORS_ALLOWED_ORIGINS`). Unknown origins get `403` at the filter, before reaching any controller.
- **Timezone:** all date validation resolves against the `app.business-timezone` clock (`Asia/Kolkata`), never against the JVM default of the host machine.
- **Error responses:** Spring Boot defaults are stripped of messages, exception classes and stack traces. A curated error envelope (`timestamp`, `status`, `error`, `message`, `path`) is introduced with the exception handling work in Phase 3.

## Sample data

Five realistic hotels (Jaipur, Udaipur, Goa, Kochi, Manali) with room categories, per-night pricing in INR and amenities are seeded via migration in Phase 2. Until then the database is intentionally empty.

## API surface (implemented so far)

| Endpoint | Status |
|---|---|
| `GET /actuator/health` | live |
| `GET /api/hotels`, `GET /api/hotels/{id}`, `GET /api/hotels/search` | Phase 3 |
| `GET /api/hotels/{id}/availability` | Phase 3 |
| `POST /api/bookings/price-quote` | Phase 3 |
| `POST /api/bookings` | Phase 3 |
| `POST /api/bookings/lookup` | Phase 3 |
| `POST /api/bookings/{reference}/cancel` | Phase 3 |

## Known limitations (as of Phase 1)

- No business endpoints exist yet; `/api/**` returns 404 by design until Phase 3.
- The concurrency regression test (two simultaneous bookings fighting for the last room) is specified and scheduled for Phase 4, once `BookingService` exists to test. It will use pessimistic row locking on `room_types`.
- H2 in MySQL mode is not byte-for-byte identical to MySQL (index hint syntax, some DDL nuances). The MySQL profile exists precisely to verify real behaviour; migrations are written to run on both engines.
- The git author identity is the sandbox default (`Z User <z@container>`) - rewrite it before publishing (`git rebase -i` with `--exec 'git commit --amend --reset-author'`, or set `git config user.name/user.email` first).
