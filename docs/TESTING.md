# Testing

How the automated suite is organized, how to run it on both database legs,
and - stated plainly - what each leg does and does not prove.

## Suite inventory

60 tests across ten classes. The four database-layer classes came with the
schema work; the six newer ones pin the REST contract, the money math and
the concurrency behaviour, including the reference+email verification pair.

| Class | Layer | What it proves |
|---|---|---|
| `SchemaMigrationTest` | database | all migrations recorded applied; all four tables exist; CHECK constraints reject zero-night stays, unknown statuses, cancelled-timestamp misuse, duplicate amenities |
| `SeedDataTest` | database | five circuit hotels; 5-7 distinct amenities each; one category per hotel, capacity 1, positive 2-decimal price |
| `BookingRepositoryTest` | database | frozen-quote round-trip; duplicate reference rejected; the half-open overlap truth table; cancelled bookings release the room |
| `RoomTypeRepositoryTest` | database | `SELECT ... FOR UPDATE` reader works; categories listable per hotel |
| `HotelApiContractTest` | REST | list/detail/search/availability shapes; sorted amenities; generic 404s; missing/blank parameter and unparseable-date validation |
| `BookingApiContractTest` | REST | quote/create/lookup/cancel; 201/200/400/404/405/409 codes; the five-field error envelope on every failure path; identical generic 404 bodies; reference+email pairing on lookup and cancel (mismatch is the same 404, email matched case-insensitively, wrong email cannot cancel); guest-input trimming |
| `BookingConcurrencyTest` | REST + database | six simultaneous POSTs fight for one room through the real HTTP stack: exactly one 201, five 409 `BOOKING_UNAVAILABLE`, exactly one persisted row |
| `PriceCalculationTest` | service | single-night and multi-night math; quote follows the current price; bookings freeze the agreed price; bookings after a reprice take the new price |
| `AvailabilityRulesTest` | service | overlaps block; half-open edges bookable; same-day turnover; cancellation releases inventory; quotes stay advisory while the booking endpoint rechecks |
| `BookingReferenceGeneratorTest` | unit | `HB-` format; transcribable alphabet (no 0/1/I/O); uniqueness at volume |

## Isolation model

The suite can be re-run any number of times, in any order, on any machine.

- **Contract and service tests** (`HotelApiContractTest`, `BookingApiContractTest`,
  `PriceCalculationTest`, `AvailabilityRulesTest`) run inside a single
  transaction that rolls back when the test ends. Nothing they write
  survives the test, so the seeded catalogue is never disturbed and no test
  can see another test's leftovers.
- **The concurrency test** is the one deliberate exception: its requests run
  on a real server whose transactions commit. It therefore brings its own
  fixture - a dedicated hotel and room category keyed by a fixed marker
  name - and removes it defensively both before and after every run. It
  never touches the seeded data, so `SeedDataTest`'s count assertions stay
  true regardless of class order.
- The H2 leg runs on an **in-memory** database that dies with the JVM, so
  even a crash mid-run leaves nothing behind. The MySQL leg persists; the
  marker-based cleanup is what keeps re-runs clean there.

### Why `src/test/resources/application-h2.yml` exists

Spring Boot resolves profile-specific files (`application-h2.yml`) above
plain ones (`application.yml`). The application ships an `application-h2.yml`
for its default profile, and with profile `h2` active during tests that file
would outrank the datasource declared in the plain test file - silently
pointing the suite at the file database behind `./data/` instead of the
in-memory one. Declaring the same-named profile file in test resources
shadows it deterministically (the test classpath is searched first). The
concurrency test's committed rows are what made this worth pinning; the
database-layer classes all rolled back, which is why the ambiguity stayed
harmless until now.

## Running the suite

### Leg 1 - H2 (MySQL compatibility mode), the default

```bash
cd backend
./mvnw test            # Windows: .\mvnw.cmd test
```

### Leg 2 - MySQL 8.4, real InnoDB

Requires Docker and the compose stack in `backend/`:

```bash
cd backend
cp .env.example .env          # Windows PowerShell: Copy-Item .env.example .env
# edit .env: set DB_PASSWORD and DB_ROOT_PASSWORD

docker compose up -d
docker compose ps             # wait until STATUS is "healthy"

# the Spring profile reads the password from the environment, not from .env
export DB_PASSWORD=<the value you set>            # PowerShell: $env:DB_PASSWORD = "..."
export SPRING_PROFILES_ACTIVE=mysql               # PowerShell: $env:SPRING_PROFILES_ACTIVE = "mysql"
./mvnw test                                       # PowerShell: .\mvnw.cmd test
```

Flyway applies the same migrations to MySQL; the identical 60 tests run
against it.

## What each leg proves - read this before quoting results

- **The concurrency regression runs on both legs and has no mocks.** The
  racing requests go through the HTTP stack into the real database, and the
  winner is decided by the row lock `BookingService.create` takes on the
  room-category row.
- **The H2 leg proves the transaction shape.** Lock, recount under lock,
  compare against capacity, persist - verified to serialize correctly under
  H2's row locks in MySQL compatibility mode.
- **The H2 leg does not verify MySQL.** H2 in compatibility mode implements
  row locking differently from InnoDB. Only the `SPRING_PROFILES_ACTIVE=mysql`
  leg exercises InnoDB's `SELECT ... FOR UPDATE` itself.
- **Any report must state which leg ran.** A result set produced on H2 alone
  may claim "the booking transaction serializes under row locks (H2, MySQL
  mode)" but must NOT claim MySQL concurrency verification. The distinction
  is one command away from being closed - see the engine nuances catalogued
  in `docs/DATABASE.md`.

## Reading results

Maven Surefire reports per class and in total:

```
Tests run: 60, Failures: 0, Errors: 0, Skipped: 0
```

- **Failures** are assertion misses; **Errors** are crashes (connection
  problems, unexpected exceptions). Both are bugs.
- **Skipped** should always be 0 - the suite has no conditional tests and
  never silently narrows its claims.
- A single class can be run in isolation, which is handy while debugging:

```bash
./mvnw test -Dtest=BookingConcurrencyTest
```
