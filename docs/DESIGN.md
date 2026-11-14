# Design

How the system is built, why it is built this way, and where its edges are.
Companion documents: `docs/API.md` (endpoint contract), `docs/DATABASE.md`
(schema detail), `docs/TESTING.md` (verification strategy), `docs/IMAGE-INVENTORY.md`
(photography rules).

## 1. System architecture

```
Browser (React 18 + TypeScript + Vite)
   │  fetch() against /api/*            dev: Vite proxy → localhost:8080
   │                                     prod: VITE_API_BASE_URL + CORS allowlist
   ▼
Spring Boot 3.5 (port 8080)
   ├─ api/        HotelController, BookingController   (REST, bean validation)
   ├─ service/    HotelService, BookingService         (business rules, transactions)
   ├─ repository/ Spring Data JPA                      (locking + overlap queries)
   ├─ domain/     Hotel, RoomType, Booking             (JPA entities)
   ├─ error/      ApiError envelope + global handler   (curated failures)
   └─ config/     CORS allowlist, Asia/Kolkata Clock
   ▼
JPA / Hibernate (ddl-auto: none - Flyway owns the schema)
   ▼
Database: MySQL 8.4 (docker compose) or H2 in MySQL mode (fast dev)
```

Deliberate choices:

- **One backend, two engines.** The same migrations and the same SQL run on
  H2 (MySQL compatibility mode) for development and on MySQL 8.4 for the
  delivered profile. Engine-specific syntax (ENUM, engine clauses) is kept
  out of the migrations so both legs stay honest; the differences that
  remain are catalogued in `docs/DATABASE.md`.
- **Credentials never enter the repository.** `application-mysql.yml` reads
  `DB_HOST/DB_PORT/DB_NAME/DB_USERNAME/DB_PASSWORD` from the environment;
  `docker-compose.yml` refuses to start without `DB_PASSWORD` and
  `DB_ROOT_PASSWORD` (`:?` interpolation). `.env` is gitignored;
  `.env.example` carries placeholders only.
- **The frontend decides nothing about money or inventory.** Prices, nights,
  availability and the booking state come from the API; the client renders
  and validates inputs (mirroring the backend's `StayDates` rules on the
  same Asia/Kolkata clock) but never computes a chargeable amount.

## 2. Data schema (four tables)

`hotels` → `hotel_amenities` (composite-PK value collection, FK cascade)
→ `room_types` (capacity, `price_per_night DECIMAL(10,2)`) → `bookings`.

Rules the database itself enforces:

| Rule | Mechanism |
|---|---|
| Half-open stays `[check_in, check_out)` | `ck_bookings_dates CHECK (check_out > check_in)`; overlap logic lives in the query, not in triggers |
| Terminal state machine | `ck_bookings_status CHECK (status IN ('CONFIRMED','CANCELLED'))` |
| Cancellation integrity | `ck_bookings_cancellation_state`: `CANCELLED` ⇔ `cancelled_at IS NOT NULL`, `CONFIRMED` ⇔ `cancelled_at IS NULL` |
| No impossible inventory | `ck_room_types_capacity > 0`, `ck_room_types_price >= 0`, `ck_bookings_total >= 0` |
| One listing per property per city | `uq_hotels_name_city` |
| Availability lookup performance | `idx_bookings_availability (room_type_id, status, check_in, check_out)` |

Money is `DECIMAL(10,2)` end to end - never floating point. A booking
freezes `price_per_night_snapshot` and `total_amount` at creation, so
repricing a room never rewrites what a guest agreed to pay.

## 3. Booking logic

`POST /api/bookings` (`BookingService.create`, one transaction):

1. **Validate** the stay against the business clock (`Asia/Kolkata`): no
   past check-in, `checkOut > checkIn`.
2. **Lock** the room-category row: `SELECT ... FOR UPDATE`
   (`RoomTypeRepository.findByIdForUpdate`). Concurrent create attempts
   for the same inventory serialize here.
3. **Recount** confirmed overlapping bookings **while holding the lock**
   (half-open comparison: `check_in < :checkOut AND check_out > :checkIn`).
4. **Compare** the count against `capacity`; `count >= capacity` answers
   `409 BOOKING_UNAVAILABLE` - a business outcome, not a server fault.
5. **Persist** with a generated `HB-` reference (12 chars, alphabet without
   `0/1/I/O` so a guest can transcribe it) and the frozen price snapshot.

`POST /api/bookings/price-quote` shares the date validation and math but
deliberately never checks availability - a quote for a sold-out room is a
valid answer, and only the booking endpoint's lock-side recount is
authoritative. Availability responses (`GET .../availability`) are
advisory for the same reason.

## 4. Cancellation strategy (the interesting part)

The requirement: N guests hitting cancel on one reservation at the same
instant must produce **exactly one success and N-1 conflicts**, with a
wrong email indistinguishable from an unknown reference.

**The transition is one atomic conditional UPDATE** (`BookingRepository.cancelConfirmedBooking`):

```sql
UPDATE bookings
SET status = 'CANCELLED', cancelled_at = :cancelledAt
WHERE booking_reference = :reference
  AND lower(guest_email) = lower(:guestEmail)
  AND status = 'CONFIRMED'
```

- InnoDB evaluates the WHERE clause against the row's **latest committed
  version while holding the row's exclusive lock** - an UPDATE is always a
  current read, at any isolation level. Whoever's predicate matches first
  flips the row; every later racer's `status = 'CONFIRMED'` predicate can
  no longer match. One winner by construction, independent of read-side
  lock discipline.
- **Affected rows decide everything.** One row affected → the response is
  built from a fresh read (`clearAutomatically` evicts the persistence
  context, so no stale managed entity can leak). Zero rows → classify:
  `SELECT ... FOR UPDATE` (a locking read, which - unlike a plain read
  under REPEATABLE-READ - always sees the latest committed row) then
  wrong email → generic 404; already CANCELLED → `409
  BOOKING_ALREADY_CANCELLED`; still CONFIRMED under our lock (a prior
  winner that rolled back) → retry the guarded write, now serialized.
- **Why not a read-then-write with a pessimistic lock?** That shape was
  tried and rejected: a read-check-update sequence built on managed
  entities proved fragile under MySQL's REPEATABLE-READ snapshot reads -
  racers re-validated against their own transaction's snapshot instead of
  the latest committed state and multiple racers believed they had won.
  The conditional UPDATE removes the race window by making the database,
  not application logic, arbitrate the state transition. The regression
  that exposed this (`BookingCancellationConcurrencyTest`: 4 racers →
  exactly 1×200 + 3×409) now passes on both legs.
- **Security invariants:** cancellation without a matching guest email is
  impossible; the generic 404 keeps a probe from learning which half of
  the (reference, email) pair was wrong; lookup is a POST so the reference
  never lands in URLs or access logs.

## 5. API design

- **One error envelope everywhere:** `timestamp`, `status`, `error`,
  `message`, `path`. `error` is the machine code (`VALIDATION_ERROR`,
  `NOT_FOUND`, `BOOKING_UNAVAILABLE`, `BOOKING_ALREADY_CANCELLED`,
  `METHOD_NOT_ALLOWED`, `INTERNAL_ERROR`); Spring's default payload stays
  stripped of internals.
- **Identity model:** the booking reference is a locator, the guest email
  is the authority. Neither alone can look up or cancel; together they are
  the only credential (assignment scope has no accounts - see §8).
- **Contract tests** pin every status code, the envelope shape, the
  identical generic-404 bodies, case-insensitive email matching, and input
  trimming, so the documented behaviour cannot drift.

## 6. Frontend design

- **Design system:** the approved "Luxury Hotel Booking - Option A"
  direction lives in `src/styles/tokens.css` (palette, type scale, motion
  rules) and is visualized on `/styleguide`. Typography: Playfair Display
  for display, Inter for UI. Reduced-motion preferences disable
  transitions globally.
- **Honest data only:** the collection, filters, availability and compare
  (up to three hotels) read the API; the price range derives from returned
  rates, never invented buckets; amenity filters are AND-semantics over
  what the results actually carry.
- **Image resilience:** seeded `image_url` is NULL by agreement, so
  `SmartImage` renders catalog-driven local assets and falls back cleanly
  (rules in `docs/IMAGE-INVENTORY.md`); a future database URL overrides
  the catalog automatically.
- **State discipline:** loading skeletons, empty states, and API error
  states are rendered explicitly; a 409 at booking time is surfaced as the
  final word, not retried blindly.

## 7. Assumptions

1. One room category per hotel, capacity 1 (single physical room) for this
   release; `capacity` remains a column so inventory can grow without a
   schema change.
2. Prices are INR per night; all date arithmetic runs on the
   `Asia/Kolkata` business clock, never the host JVM clock.
3. Booking identity is the reference+email pair; no accounts, sessions or
   cookies.
4. Availability answers are advisory; only the lock-side recount at
   booking time is authoritative.
5. Cancellation is terminal and immediate; inventory releases the moment
   the row flips (the overlap query simply stops counting it).

## 8. Known limitations (stated honestly)

- **No recovery path:** a guest who loses both their reference and access
  to their inbox cannot recover a booking. The spec has no accounts.
- **No cancel-by cutoff:** a stay whose check-in has passed can still be
  cancelled; the spec defined no cutoff (adding one is a single service
  check).
- **H2 is not byte-for-byte MySQL:** index hints, some DDL nuances and
  identifier casing differ; the MySQL profile exists precisely to verify
  real behaviour, and test reports must state which leg ran.
- **No pagination or caching layer:** five seeded properties make both
  unnecessary; they would be the first additions at real catalogue size.
- **No rate limiting / brute-force protection** on lookup: the generic 404
  keeps probes uninformed, but a production deployment would add throttling.
- **Photography:** `image_url` is NULL for all seeded properties; the
  frontend ships curated local assets instead (see `docs/IMAGE-INVENTORY.md`).

## 9. Verification approach

Two test legs, one suite (66 tests, eleven classes - see `docs/TESTING.md`):

| Leg | Engine | What it proves |
|---|---|---|
| Default | H2 2.x, MySQL compatibility mode, in-memory | transaction shape (lock → recount → compare → persist), all REST contracts, money math, both concurrency regressions under H2 row locks |
| `SPRING_PROFILES_ACTIVE=mysql` | MySQL 8.4 (Docker), real InnoDB | the identical suite against real `SELECT ... FOR UPDATE` row locks and the real conditional-UPDATE cancellation race |

Both legs green is the release gate; any report must name the engine it ran on.
