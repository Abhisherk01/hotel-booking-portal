# REST API

Contract for the hotel booking API as of Phase 3. Everything below is
implemented and exercised end-to-end on the H2 (MySQL mode) profile; the
same behaviour runs unchanged on the MySQL profile.

- **Base URL:** `http://localhost:8080`
- **Content type:** `application/json` for request and response bodies
- **Dates:** ISO `yyyy-MM-dd` for stay dates; timestamps render as ISO-8601
  local date-times
- **Interactive docs:** `/swagger-ui.html` and `/v3/api-docs` (springdoc,
  enabled as a development convenience)

## Error envelope

Every failure returns the same shape, and nothing else:

```json
{
  "timestamp": "2026-11-13T18:39:02.114+05:30",
  "status": 409,
  "error": "BOOKING_UNAVAILABLE",
  "message": "The room category is already booked for those dates.",
  "path": "/api/bookings"
}
```

`error` is the stable code to branch on; `message` is what a human reads.
Spring's default error payload (stack traces, exception class names) stays
disabled.

| Status | Code | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` | malformed JSON, missing fields, bad email, past check-in, reversed dates, unknown query parameter |
| 404 | `NOT_FOUND` | unknown hotel id, room type, booking reference or path - always this same generic body |
| 405 | `METHOD_NOT_ALLOWED` | wrong verb on an existing path |
| 409 | `BOOKING_UNAVAILABLE` | the room category filled while the request was in flight |
| 409 | `BOOKING_ALREADY_CANCELLED` | cancellation hit a booking that is already terminal |
| 500 | `INTERNAL_ERROR` | anything unexpected; details go to the server log only |

## Endpoints

### `GET /api/hotels`

All five seeded properties, amenities sorted.

```
curl http://localhost:8080/api/hotels
```

### `GET /api/hotels/{id}`

One property with its room categories.

```
curl http://localhost:8080/api/hotels/1
```

### `GET /api/hotels/search?city=jaipur`

City token match, case-blind. The `city` parameter is required.

```
curl "http://localhost:8080/api/hotels/search?city=jaipur"
```

### `GET /api/hotels/{id}/availability?checkIn=2026-12-01&checkOut=2026-12-03`

Per room category: how many units remain for the half-open stay
`[checkIn, checkOut)` and whether it is bookable at all.

```
curl "http://localhost:8080/api/hotels/1/availability?checkIn=2026-12-01&checkOut=2026-12-03"
```

This endpoint is advisory. Between this answer and the booking request the
world can move; the only decision that is authoritative happens under a row
lock at booking time.

### `POST /api/bookings/price-quote`

Cost of a stay. Answers "what would it cost" and never checks
availability - quoting a sold-out room is still a valid quote.

```json
{ "roomTypeId": 1, "checkIn": "2026-12-01", "checkOut": "2026-12-03" }
```

Response carries `nights` (2), `pricePerNight` (8500.00) and
`totalAmount` (17000.00).

### `POST /api/bookings`

Creates a CONFIRMED booking and returns it with its reference.

```json
{
  "roomTypeId": 1,
  "guestName": "Meera Iyer",
  "guestEmail": "meera@example.in",
  "checkIn": "2026-12-01",
  "checkOut": "2026-12-03"
}
```

Returns `201` with the full booking view; the `reference` (format `HB-` plus
nine unambiguous characters) is the only credential a guest needs for
lookup and cancellation.

### `POST /api/bookings/lookup`

```json
{ "reference": "HB-B9TF3FHA9" }
```

Lookup is a POST on purpose: the reference then never sits in a URL path,
an access log or a `Referrer` header. Unknown and mistyped references
return the same generic 404 as everything else.

### `POST /api/bookings/{reference}/cancel`

Marks the booking CANCELLED and stamps `cancelledAt` from the business
clock. The room returns to inventory immediately - a half-open overlap
query simply stops counting it.

## Business rules

1. **Half-open stays.** `[checkIn, checkOut)` - one guest's check-out may
   be the next guest's check-in. Same-day turnover never conflicts.
2. **Frozen quote.** `pricePerNight` and `totalAmount` on a booking are
   snapshots taken at creation. Repricing a room category never rewrites
   what a guest agreed to pay.
3. **Bookable future only.** `checkIn` may not be before today, resolved
   on the `Asia/Kolkata` business clock rather than the server's clock.
4. **Terminal cancellation.** `CANCELLED` is final; cancelling a cancelled
   booking is a 409, not a reset.
5. **One decision under lock.** Booking serializes on the room category's
   row (`SELECT ... FOR UPDATE`), recounts confirmed overlaps while
   holding the lock, and compares against capacity. Losers get 409
   `BOOKING_UNAVAILABLE` - a business outcome, not a server fault.
6. **Generic 404 everywhere.** No endpoint distinguishes "does not exist"
   from "exists but you may not know that".

## Deliberate limitations

- No authentication. A reference holder can look up and cancel; the
  assignment scope has no accounts.
- No cancel-by cutoff (a stay whose check-in has passed can still be
  cancelled). The spec did not define a cutoff; adding one is a single
  service check.
- Availability answers are advisory by design (see rule 5); the frontend
  should treat a 409 at booking time as the final word.
