# Hotel Booking Portal

A full-stack hotel booking application: browse hotels, check date availability, book one room, retrieve and cancel reservations - built as a technical interview assignment.

**Current status:** Phase 2 of 9 complete (database layer: migrations, entities, repositories, tests). REST endpoints arrive in Phase 3, the web client in Phase 5. This README documents only what exists right now.

## Stack (backend)

| Layer | Technology |
|---|---|
| Language | Java 21 (Temurin) |
| Framework | Spring Boot 3.5.16 (Web, Data JPA, Validation, Actuator) |
| Persistence | Spring Data JPA (Hibernate) on a Flyway-owned schema |
| Database | H2 (MySQL compatibility mode) for development, MySQL 8.4 for full local runs |
| Build | Maven 3.9 (wrapper included, no local Maven install required) |
| Tests | JUnit 5 + AssertJ + Spring Boot Test (15 database-layer tests) |

## Repository layout

```
backend/                       Spring Boot REST API (port 8080)
  src/main/java/com/hotelbooking/
    HotelBookingApplication.java
    config/                    CORS allowlist, business timezone clock
    domain/                    Hotel, RoomType, Booking, BookingStatus
    repository/                Spring Data repositories (incl. pessimistic row lock)
  src/main/resources/
    application.yml            shared configuration
    application-h2.yml         default profile - embedded H2, file-persisted
    application-mysql.yml      MySQL profile - credentials from environment only
    db/migration/
      V1__schema.sql           four tables, constraints, availability index
      V2__sample_data.sql      five seeded hotels, INR pricing, amenities
  src/test/java/               database-layer tests (migrations, seed, repositories)
  src/test/resources/          test datasource: in-memory H2, MySQL mode
  docker-compose.yml           MySQL 8.4 for the local database profile
  .env.example                 environment template (copy to .env, never committed)
docs/
  DATABASE.md                  schema documentation and verification guide
frontend/                      arrives in Phase 5
```

## Prerequisites

- JDK 21 (`java -version` should report 21.x; newer JDKs also compile correctly since the build targets `--release 21`)
- That is all for the H2 profile - the Maven wrapper downloads Maven itself.
- Docker + Docker Compose, only if you want the MySQL profile.

## Running with H2 (default profile)

```bash
cd backend
./mvnw spring-boot:run
```

On first boot the API compiles, starts on port 8080, creates `backend/data/hotelbooking.mv.db` and applies both migrations, so the database seeds itself. An existing Phase 1 database upgrades in place - migrations apply, nothing is wiped. Useful endpoints while the profile is active:

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

Connection details resolve from the environment (`DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USERNAME`, `DB_PASSWORD`). No default password exists anywhere in the repository - set real values in `.env` before starting anything.

## Verifying the schema and seed data

Flyway is enabled and owns the schema; Hibernate is configured with `ddl-auto: none` and can never create tables.

1. Boot the API with either profile and watch the log for `Migrating schema "PUBLIC" to version "1 - schema"` and `"2 - sample data"`.
2. Open the H2 console (H2 profile) or any MySQL client and run:

```sql
SELECT version, description, success FROM flyway_schema_history ORDER BY installed_rank;
```

On the H2 console this exact statement needs H2-style quoting (see `docs/DATABASE.md` for why):

```sql
SELECT "version", "description", "success" FROM "flyway_schema_history" ORDER BY "installed_rank";
```

3. Expect three rows: Flyway's own marker (rank -1, null version, `<< Flyway Schema History table created >>`) plus versions 1 and 2 - every row with `success = TRUE`. A failed migration leaves a row with `success = 0` and the API refuses to boot until it is resolved.
4. Confirm the seed landed:

```sql
SELECT (SELECT COUNT(*) FROM hotels)         AS hotels,
       (SELECT COUNT(*) FROM hotel_amenities) AS amenities,
       (SELECT COUNT(*) FROM room_types)      AS room_types;
-- expect: 5 hotels, 30 amenities, 5 room types
```

## Tests

```bash
cd backend
./mvnw test
```

15 database-layer tests run against in-memory H2 in MySQL compatibility mode - the same migration files are exercised, just not the file database behind the running app. Coverage:

| Suite | What it proves |
|---|---|
| `SchemaMigrationTest` | both migrations recorded applied; all four tables exist; CHECK constraints reject impossible rows (zero-night stays, unknown statuses, cancelled-timestamp misuse, duplicate amenities) |
| `SeedDataTest` | five circuit hotels; 5-7 distinct amenities each; exactly one room category per hotel, capacity 1, positive 2-decimal price |
| `BookingRepositoryTest` | frozen-quote round-trip; duplicate reference rejected; the half-open overlap truth table; cancelled bookings release the room |
| `RoomTypeRepositoryTest` | `SELECT ... FOR UPDATE` reader works; categories listable per hotel |

The identical suite runs against real MySQL when Docker is available:

```bash
SPRING_PROFILES_ACTIVE=mysql ./mvnw test
```

## Configuration notes

- **CORS:** browsers may call the API only from origins listed in `app.cors.allowed-origins` (default `http://localhost:3000`, override with `CORS_ALLOWED_ORIGINS`). Unknown origins get `403` at the filter, before reaching any controller.
- **Timezone:** all date validation resolves against the `app.business-timezone` clock (`Asia/Kolkata`), never against the JVM default of the host machine.
- **Error responses:** Spring Boot defaults are stripped of messages, exception classes and stack traces. A curated error envelope (`timestamp`, `status`, `error`, `message`, `path`) is introduced with the exception handling work in Phase 3.

## Sample data

Five properties on the classic Indian leisure circuit, one room category each (capacity 1 for this release), priced per night in INR:

| City | Property | Category | Price/night |
|---|---|---|---|
| Jaipur | Hawa Mahal Courtyard Haveli | Heritage Courtyard Room | Rs 8,500 |
| Udaipur | Lake Pichola Stone Villa | Lakefront Stone Room | Rs 12,400 |
| Goa | Cavelossim Palms Beach House | Beachside Cottage | Rs 7,800 |
| Kochi | Fort Kochi Spice Residence | Colonial Veranda Room | Rs 6,900 |
| Manali | Cedar Ridge Mountain Lodge | Cedar View Cabin | Rs 5,900 |

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

## Known limitations (as of Phase 2)

- No business endpoints exist yet; `/api/**` returns 404 by design until Phase 3. Booking business logic - reference generation, quoting, the lock-and-recount booking transaction, cancellation rules - is Phase 3 scope.
- The concurrency regression test (two simultaneous bookings fighting for the last room) is specified and scheduled for Phase 4, once `BookingService` exists to test. It will use the pessimistic row lock on `room_types` delivered in this phase.
- The test suite was executed against H2 in MySQL compatibility mode in the build environment; the MySQL run of the same suite is one documented command away (`SPRING_PROFILES_ACTIVE=mysql ./mvnw test`) - see `docs/DATABASE.md`.
- H2 in MySQL mode is not byte-for-byte identical to MySQL (index hint syntax, some DDL nuances, identifier casing - all documented in `docs/DATABASE.md`). The MySQL profile exists precisely to verify real behaviour; migrations are written to run on both engines.
- The git author identity is the sandbox default (`Z User <z@container>`) - rewrite it before publishing (`git rebase -i` with `--exec 'git commit --amend --reset-author'`, or set `git config user.name/user.email` first).
