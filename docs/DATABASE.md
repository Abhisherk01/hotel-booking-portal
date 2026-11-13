# Database layer

The schema lives in Flyway migrations and nowhere else. Hibernate maps onto
it with `ddl-auto: none` and can never create or alter a table. One migration
set runs unchanged on both engines:

| Engine | Where it is used |
|---|---|
| H2 2.x, MySQL compatibility mode | default dev profile (`application-h2.yml`), test suite |
| MySQL 8.4 | delivered profile (`application-mysql.yml` + `docker-compose.yml`) |

## Tables

### hotels

| Column | Type | Notes |
|---|---|---|
| id | BIGINT | identity primary key |
| name | VARCHAR(160) | NOT NULL |
| city | VARCHAR(80) | NOT NULL |
| description | VARCHAR(1000) | NOT NULL |

Constraint: `uq_hotels_name_city UNIQUE (name, city)` - the same property
cannot be listed twice for one city.

### hotel_amenities

| Column | Type | Notes |
|---|---|---|
| hotel_id | BIGINT | NOT NULL, FK to hotels, ON DELETE CASCADE |
| amenity | VARCHAR(80) | NOT NULL |

Primary key: composite `(hotel_id, amenity)`. The pair is the identity -
duplicates are rejected by the database itself. There is no surrogate id
because amenities are a plain value collection, not entities.

### room_types

| Column | Type | Notes |
|---|---|---|
| id | BIGINT | identity primary key |
| hotel_id | BIGINT | NOT NULL, FK to hotels |
| name | VARCHAR(120) | NOT NULL |
| capacity | INT | NOT NULL, CHECK `capacity > 0` |
| price_per_night | DECIMAL(10,2) | NOT NULL, CHECK `>= 0` |

Every hotel exposes exactly one category in this release and capacity is
fixed at one physical room, so availability reduces to a date-overlap count
over bookings. capacity stays a first-class column so inventory can grow
without a schema change.

### bookings

| Column | Type | Notes |
|---|---|---|
| id | BIGINT | identity primary key |
| booking_reference | VARCHAR(12) | NOT NULL, UNIQUE - generated in Phase 3 (`HB-` + 9 unambiguous chars) |
| room_type_id | BIGINT | NOT NULL, FK to room_types |
| guest_name | VARCHAR(120) | NOT NULL |
| guest_email | VARCHAR(160) | NOT NULL |
| check_in | DATE | NOT NULL, half-open range start |
| check_out | DATE | NOT NULL, CHECK `check_out > check_in` |
| status | VARCHAR(20) | NOT NULL, CHECK `IN ('CONFIRMED', 'CANCELLED')` |
| price_per_night_snapshot | DECIMAL(10,2) | NOT NULL, frozen at creation |
| total_amount | DECIMAL(10,2) | NOT NULL, CHECK `>= 0`, frozen at creation |
| created_at | DATETIME | NOT NULL, DEFAULT CURRENT_TIMESTAMP |
| cancelled_at | DATETIME | NULL |

CHECK `ck_bookings_cancellation_state`: a CANCELLED row must carry
`cancelled_at`; a CONFIRMED row must not. The entity's `markCancelled()`
moves both fields together; the database enforces the invariant
independently of any code path.

### Index

```
idx_bookings_availability (room_type_id, status, check_in, check_out)
```

Serves the availability count: for a room type and date range, find
non-cancelled bookings overlapping the range. The leading columns match the
query's equality predicates; the dates handle the range scan.

## Design decisions (interview notes)

- **VARCHAR + CHECK instead of ENUM for status** - ENUM is MySQL-specific
  DDL that H2 handles differently; a CHECK constraint is standard and
  portable. The Java side still gets a real type-safe enum via
  `@Enumerated(EnumType.STRING)`.
- **No email-format CHECK** - regular-expression constraints are brittle
  and engine-divergent. The database guards structural invariants (types,
  ranges, state pairs); content patterns like email format belong to
  bean validation at the service boundary (Phase 3).
- **Price snapshots** - repricing a room type must never rewrite what a
  guest agreed to pay. `price_per_night_snapshot` and `total_amount` are
  written once at creation; `Booking` has no code path that mutates them.
- **No `number_of_rooms` column** - a booking occupies exactly one room of
  its type; `capacity` on `room_types` IS the inventory. A count column on
  bookings would be denormalized state with no meaning.
- **Half-open stay ranges** `[check_in, check_out)` - one guest's
  check-out date may be the next guest's check-in date (same-day turnover).
  Overlap predicate: `existing.check_in < requested.check_out AND
  existing.check_out > requested.check_in`.
- **Composite PK on amenities** - normalized storage per the assignment
  (no comma-separated columns), no surrogate id to maintain, and the
  uniqueness rule is enforced where the data lives.

## Portability notes (learned while verifying, kept documented)

- Flyway creates its history table **quoted lowercase**
  (`"flyway_schema_history"`). H2 resolves unquoted identifiers to
  UPPERCASE, so ad-hoc SQL against H2 must quote the table and column
  names: `SELECT "version" FROM "flyway_schema_history"`. MySQL resolves
  unquoted lowercase names as-is and needs no quoting. The test datasource
  adds `DATABASE_TO_LOWER=TRUE` so unquoted test SQL behaves like MySQL.
- Flyway 10+ records a marker row when it creates the history table
  (`installed_rank = -1`, `version = NULL`, description
  `<< Flyway Schema History table created >>`). Verification queries
  should filter with `version IS NOT NULL` to see real migrations only.
- The migrations deliberately avoid ENUM columns, engine clauses, stored
  procedures and anything else the two engines disagree on. CHECK
  constraints are enforced by MySQL 8.0.16+ and by H2, so the same
  violations are rejected on both.

## Verifying on H2 (default profile)

1. Run the suite (in-memory H2, MySQL mode - migrations included):
   ```bash
   cd backend && ./mvnw test
   ```
2. Boot the API (`./mvnw spring-boot:run`) and open
   `http://localhost:8080/h2-console` (JDBC URL
   `jdbc:h2:file:./data/hotelbooking;MODE=MySQL`, user `sa`, empty password):

   ```sql
   SELECT "version", "description", "success"
   FROM "flyway_schema_history" ORDER BY "installed_rank";
   -- marker row (rank -1) + versions 1 and 2, all success = TRUE

   SELECT (SELECT COUNT(*) FROM hotels)          AS hotels,
          (SELECT COUNT(*) FROM hotel_amenities)  AS amenities,
          (SELECT COUNT(*) FROM room_types)       AS room_types;
   -- expect: 5 / 30 / 5
   ```

## Verifying on MySQL

1. Configure and start the database:
   ```bash
   cd backend
   cp .env.example .env      # set DB_PASSWORD and DB_ROOT_PASSWORD
   docker compose up -d
   docker compose ps         # wait for STATUS: healthy
   ```
2. Boot against it (`SPRING_PROFILES_ACTIVE=mysql ./mvnw spring-boot:run`) -
   Flyway applies the same two migrations to MySQL.
3. Inspect with the client inside the container:
   ```bash
   docker exec -it <mysql-container> mysql -u hotel_app -p hotel_booking
   ```
   ```sql
   SELECT version, description, success FROM flyway_schema_history
   ORDER BY installed_rank;
   SELECT COUNT(*) FROM hotels;   -- 5
   ```
4. Run the test suite against MySQL:
   ```bash
   SPRING_PROFILES_ACTIVE=mysql ./mvnw test
   ```

## Migrating forward

Schema changes are new versioned files (`V3__...sql`), never edits to
applied ones - Flyway validates checksums and refuses to boot on a
mismatch. That is also what makes the H2 and MySQL profiles provably
identical: they run the same files, in the same order, with the same
checksums.
