package com.hotelbooking.api;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Callable;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The cancellation twin of {@code BookingConcurrencyTest}: four guests hit
 * cancel on the same reservation at the same instant, through the HTTP
 * stack into the real database - no mocks anywhere on the path. The race
 * is decided by an atomic conditional UPDATE (match reference +
 * case-insensitive email + status = CONFIRMED, set CANCELLED, stamp
 * cancelled_at): InnoDB evaluates that WHERE clause against the row's
 * latest committed version while holding the row's exclusive lock, so
 * exactly one request can ever see affected rows = 1 and answer 200, and
 * every other one is classified 409 BOOKING_ALREADY_CANCELLED (or the
 * generic 404 when its email did not match) by the follow-up
 * SELECT ... FOR UPDATE read - a locking read, because a plain read under
 * REPEATABLE-READ would serve this transaction's stale snapshot instead
 * of the winner's committed terminal state. Two requests believing they
 * both did the cancelling is what the one-row update makes impossible.
 *
 * A second race probes the security side: four cancels with the wrong
 * email must all bounce off the generic 404 and leave the booking alive
 * for its real guest. Two further checks pin the terminal state and its
 * side effects: another cancel after the race is still a 409, and the
 * cancelled booking's room goes straight back into inventory.
 *
 * Engine honesty (see docs/TESTING.md): like the booking race, this test
 * runs against whatever database the active profile provides. On the
 * default H2 leg it proves the atomic-transition shape under H2's row
 * locks in MySQL compatibility mode; only the
 * SPRING_PROFILES_ACTIVE=mysql leg exercises InnoDB's conditional-update
 * row locks themselves, and any test report must say which leg actually
 * ran.
 *
 * Unlike the contract tests this class COMMITS: the server owns the
 * transactions, so the fixture manages itself - a dedicated hotel + category
 * keyed by a fixed marker name, created and removed defensively before and
 * after every run, on any engine, in any order, however many times the
 * suite is re-run.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class BookingCancellationConcurrencyTest {

    /** Fixed marker: the cleanup can find and remove this fixture on any engine. */
    private static final String MARKER_HOTEL = "Cancellation Race Property (Phase 5 fixture)";

    private static final int RACERS = 4;

    private static final String GUEST_EMAIL = "responsible.guest@example.in";

    private static final String GENERIC_404_MESSAGE = "The requested resource was not found.";

    @Autowired
    private TestRestTemplate rest;

    @Autowired
    private JdbcTemplate jdbc;

    @Autowired
    private ObjectMapper mapper;

    @Autowired
    private Clock clock;

    private String reference;

    private Long roomTypeId;

    @BeforeEach
    void seedTheRaceBooking() throws Exception {
        removeFixture();

        jdbc.update("insert into hotels (name, city, description) values (?, ?, ?)",
                MARKER_HOTEL, "Udaipur", "Phase 5 cancellation fixture - safe to delete.");
        Long hotelId = jdbc.queryForObject(
                "select id from hotels where name = ?", Long.class, MARKER_HOTEL);
        jdbc.update(
                "insert into room_types (hotel_id, name, capacity, price_per_night) values (?, ?, ?, ?)",
                hotelId, "Race Category", 1, new BigDecimal("4200.00"));
        roomTypeId = jdbc.queryForObject(
                "select id from room_types where hotel_id = ?", Long.class, hotelId);

        LocalDate checkIn = LocalDate.now(clock).plusDays(30);
        LocalDate checkOut = checkIn.plusDays(3);
        Map<String, Object> request = Map.of(
                "roomTypeId", roomTypeId,
                "guestName", "Responsible Guest",
                "guestEmail", GUEST_EMAIL,
                "checkIn", checkIn.toString(),
                "checkOut", checkOut.toString());
        ResponseEntity<String> created = rest.postForEntity("/api/bookings", request, String.class);
        assertThat(created.getStatusCode().value())
                .as("the fixture booking must exist before anyone races for it")
                .isEqualTo(201);
        reference = mapper.readTree(created.getBody()).get("reference").asText();
    }

    @AfterEach
    void removeFixture() {
        // children first: bookings -> categories -> amenities -> hotel
        jdbc.update("delete from bookings where room_type_id in "
                + "(select id from room_types where hotel_id in "
                + "(select id from hotels where name = ?))", MARKER_HOTEL);
        jdbc.update("delete from room_types where hotel_id in "
                + "(select id from hotels where name = ?)", MARKER_HOTEL);
        jdbc.update("delete from hotel_amenities where hotel_id in "
                + "(select id from hotels where name = ?)", MARKER_HOTEL);
        jdbc.update("delete from hotels where name = ?", MARKER_HOTEL);
    }

    /** Four racers step over the same gate and cancel the same booking. */
    private List<ResponseEntity<String>> raceCancels(String guestEmail) throws Exception {
        CyclicBarrier gate = new CyclicBarrier(RACERS);
        ExecutorService pool = Executors.newFixedThreadPool(RACERS);

        try {
            List<Future<ResponseEntity<String>>> futures = new ArrayList<>();
            for (int i = 0; i < RACERS; i++) {
                futures.add(pool.submit((Callable<ResponseEntity<String>>) () -> {
                    gate.await(10, TimeUnit.SECONDS);
                    Map<String, Object> body = Map.of("guestEmail", guestEmail);
                    return rest.postForEntity("/api/bookings/{reference}/cancel",
                            body, String.class, reference);
                }));
            }

            List<ResponseEntity<String>> results = new ArrayList<>();
            for (Future<ResponseEntity<String>> future : futures) {
                results.add(future.get(30, TimeUnit.SECONDS));
            }
            return results;
        } finally {
            pool.shutdownNow();
            try {
                // give interrupted racers a chance to finish, so the fixture
                // cleanup in @AfterEach never races a still-committing thread
                pool.awaitTermination(5, TimeUnit.SECONDS);
            } catch (InterruptedException interrupted) {
                Thread.currentThread().interrupt();
            }
        }
    }

    @Test
    void simultaneousCancelsOfOneBookingYieldExactlyOneSuccess() throws Exception {
        List<ResponseEntity<String>> results = raceCancels(GUEST_EMAIL);

        int confirmed = 0;
        int conflicts = 0;
        List<String> unexpected = new ArrayList<>();

        for (ResponseEntity<String> response : results) {
            HttpStatus status = HttpStatus.valueOf(response.getStatusCode().value());
            JsonNode body = mapper.readTree(response.getBody());

            if (status == HttpStatus.OK) {
                confirmed++;
                assertThat(body.get("status").asText()).isEqualTo("CANCELLED");
                assertThat(body.hasNonNull("cancelledAt")).isTrue();
                assertThat(body.get("reference").asText()).isEqualTo(reference);
            } else if (status == HttpStatus.CONFLICT) {
                conflicts++;
                // every loser loses to the terminal state, not to infrastructure
                assertThat(body.get("error").asText()).isEqualTo("BOOKING_ALREADY_CANCELLED");
                assertThat(body.get("message").asText()).isEqualTo("This booking was already cancelled.");
            } else {
                unexpected.add(status.value() + ": " + body.get("error").asText());
            }
        }

        assertThat(unexpected).as("no 5xx, no lock timeouts, no surprises").isEmpty();
        assertThat(confirmed).as("exactly one request does the cancelling").isEqualTo(1);
        assertThat(conflicts).as("everyone else meets the terminal state").isEqualTo(RACERS - 1);

        // and the database agrees: one row, CANCELLED, stamped exactly once
        String status = jdbc.queryForObject(
                "select status from bookings where booking_reference = ?", String.class, reference);
        assertThat(status).isEqualTo("CANCELLED");
        java.time.LocalDateTime cancelledAt = jdbc.queryForObject(
                "select cancelled_at from bookings where booking_reference = ?",
                java.time.LocalDateTime.class, reference);
        assertThat(cancelledAt).as("the terminal state carries its timestamp").isNotNull();
        // one terminal transition, not several: exactly one CANCELLED row
        // for this booking, and it is the only one carrying a stamp
        Long terminalRows = jdbc.queryForObject(
                "select count(*) from bookings where booking_reference = ? "
                        + "and status = 'CANCELLED' and cancelled_at is not null",
                Long.class, reference);
        assertThat(terminalRows).as("exactly one terminal database transition").isEqualTo(1);
    }

    @Test
    void aFurtherCancelAfterTheRaceIsStillAConflict() throws Exception {
        List<ResponseEntity<String>> results = raceCancels(GUEST_EMAIL);

        int confirmed = 0;
        for (ResponseEntity<String> response : results) {
            if (response.getStatusCode().value() == 200) {
                confirmed++;
            }
        }
        assertThat(confirmed).as("the race precondition: one winner").isEqualTo(1);

        // the winner's transaction is long committed by the time the racers'
        // futures are gathered, so this fifth attempt reads committed state
        ResponseEntity<String> again = rest.postForEntity("/api/bookings/{reference}/cancel",
                Map.of("guestEmail", GUEST_EMAIL), String.class, reference);
        assertThat(again.getStatusCode().value())
                .as("cancellation is terminal: a later cancel cannot reset it")
                .isEqualTo(409);
        com.fasterxml.jackson.databind.JsonNode body = mapper.readTree(again.getBody());
        assertThat(body.get("error").asText()).isEqualTo("BOOKING_ALREADY_CANCELLED");
        assertThat(body.get("message").asText()).isEqualTo("This booking was already cancelled.");

        // and the terminal row still carries exactly one stamp
        Long stamped = jdbc.queryForObject(
                "select count(*) from bookings where booking_reference = ? "
                        + "and status = 'CANCELLED' and cancelled_at is not null",
                Long.class, reference);
        assertThat(stamped).as("still exactly one terminal transition").isEqualTo(1);
    }

    @Test
    void theRaceLoserRoomGoesStraightBackIntoInventory() throws Exception {
        List<ResponseEntity<String>> results = raceCancels(GUEST_EMAIL);

        int confirmed = 0;
        for (ResponseEntity<String> response : results) {
            if (response.getStatusCode().value() == 200) {
                confirmed++;
            }
        }
        assertThat(confirmed).as("the race precondition: one winner").isEqualTo(1);

        // the same room category, the very same dates: capacity 1 was
        // held by the (now cancelled) booking, and the cancellation must
        // have released it - a fresh booking succeeds immediately
        LocalDate checkIn = LocalDate.now(clock).plusDays(30);
        LocalDate checkOut = checkIn.plusDays(3);
        Map<String, Object> rebooking = Map.of(
                "roomTypeId", roomTypeId,
                "guestName", "Next Guest",
                "guestEmail", "next.guest@example.in",
                "checkIn", checkIn.toString(),
                "checkOut", checkOut.toString());
        ResponseEntity<String> rebooked = rest.postForEntity("/api/bookings", rebooking, String.class);
        assertThat(rebooked.getStatusCode().value())
                .as("a cancelled booking releases its room immediately")
                .isEqualTo(201);
        assertThat(mapper.readTree(rebooked.getBody()).get("status").asText())
                .isEqualTo("CONFIRMED");
    }

    @Test
    void wrongEmailRacersCannotCancelAndTheBookingSurvives() throws Exception {
        List<ResponseEntity<String>> results = raceCancels("someone.else@example.in");

        List<String> unexpected = new ArrayList<>();
        for (ResponseEntity<String> response : results) {
            HttpStatus status = HttpStatus.valueOf(response.getStatusCode().value());
            JsonNode body = mapper.readTree(response.getBody());
            if (status != HttpStatus.NOT_FOUND) {
                unexpected.add(status.value() + ": " + body.get("error").asText());
                continue;
            }
            // the generic 404 - the same answer an unknown reference gets,
            // so the racers learn nothing about which half was wrong
            assertThat(body.get("error").asText()).isEqualTo("NOT_FOUND");
            assertThat(body.get("message").asText()).isEqualTo(GENERIC_404_MESSAGE);
        }
        assertThat(unexpected).as("wrong emails are 404s, nothing else").isEmpty();

        String status = jdbc.queryForObject(
                "select status from bookings where booking_reference = ?", String.class, reference);
        assertThat(status).as("no wrong email may touch the booking").isEqualTo("CONFIRMED");

        // the real guest can still cancel the very same booking afterwards
        ResponseEntity<String> real = rest.postForEntity("/api/bookings/{reference}/cancel",
                Map.of("guestEmail", GUEST_EMAIL), String.class, reference);
        assertThat(real.getStatusCode().value()).isEqualTo(200);
        assertThat(mapper.readTree(real.getBody()).get("status").asText()).isEqualTo("CANCELLED");
    }
}
