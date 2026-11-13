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
 * THE concurrency regression: six guests POST /api/bookings at the same
 * instant, fighting over one physical room. There are no mocks anywhere on
 * the path - the race goes through the HTTP stack into the real database,
 * and the winner is decided by the pessimistic row lock
 * (SELECT ... FOR UPDATE) that BookingService.create takes on the
 * room-category row before recounting availability.
 *
 * Engine honesty (see docs/TESTING.md): this test runs against whatever
 * database the active profile provides. On the default H2 leg it proves the
 * transaction shape - lock, recount under lock, compare, persist - under
 * H2's row locks in MySQL compatibility mode. It does NOT verify MySQL.
 * Only the SPRING_PROFILES_ACTIVE=mysql leg (InnoDB row locks) constitutes
 * MySQL concurrency verification, and any test report must say which leg
 * actually ran.
 *
 * Unlike the rest of the suite this test COMMITS: the server owns the
 * transactions, so the fixture manages itself. A dedicated hotel + category
 * keyed by a fixed marker name is created for the race and removed
 * defensively before and after every run - on any engine, in any order,
 * however many times the suite is re-run.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class BookingConcurrencyTest {

    /** Fixed marker: the cleanup can find and remove this fixture on any engine. */
    private static final String MARKER_HOTEL = "Concurrency Race Property (Phase 4 fixture)";

    private static final int RACERS = 6;

    private static final String REFERENCE_FORMAT = "HB-[2-9A-HJ-NP-Z]{9}";

    @Autowired
    private TestRestTemplate rest;

    @Autowired
    private JdbcTemplate jdbc;

    @Autowired
    private ObjectMapper mapper;

    @Autowired
    private Clock clock;

    private long roomTypeId;
    private LocalDate checkIn;
    private LocalDate checkOut;

    @BeforeEach
    void seedTheRaceRoom() {
        removeFixture();

        jdbc.update("insert into hotels (name, city, description) values (?, ?, ?)",
                MARKER_HOTEL, "Jaipur", "Phase 4 concurrency fixture - safe to delete.");
        Long hotelId = jdbc.queryForObject(
                "select id from hotels where name = ?", Long.class, MARKER_HOTEL);
        jdbc.update(
                "insert into room_types (hotel_id, name, capacity, price_per_night) values (?, ?, ?, ?)",
                hotelId, "Race Category", 1, new BigDecimal("4100.00"));
        roomTypeId = jdbc.queryForObject(
                "select id from room_types where hotel_id = ?", Long.class, hotelId);

        checkIn = LocalDate.now(clock).plusDays(21);
        checkOut = checkIn.plusDays(2);
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

    @Test
    void sixSimultaneousBookingsYieldExactlyOneConfirmation() throws Exception {
        CyclicBarrier gate = new CyclicBarrier(RACERS);
        ExecutorService pool = Executors.newFixedThreadPool(RACERS);

        try {
            List<Future<ResponseEntity<String>>> results = new ArrayList<>();
            for (int i = 0; i < RACERS; i++) {
                final String guest = "Racer " + (i + 1);
                results.add(pool.submit((Callable<ResponseEntity<String>>) () -> {
                    gate.await(10, TimeUnit.SECONDS);
                    Map<String, Object> request = Map.of(
                            "roomTypeId", roomTypeId,
                            "guestName", guest,
                            "guestEmail", guest.toLowerCase().replace(' ', '.') + "@example.in",
                            "checkIn", checkIn.toString(),
                            "checkOut", checkOut.toString());
                    return rest.postForEntity("/api/bookings", request, String.class);
                }));
            }

            int created = 0;
            int conflicts = 0;
            List<String> unexpected = new ArrayList<>();
            String winningReference = null;

            for (Future<ResponseEntity<String>> future : results) {
                ResponseEntity<String> response = future.get(30, TimeUnit.SECONDS);
                HttpStatus status = HttpStatus.valueOf(response.getStatusCode().value());
                JsonNode body = mapper.readTree(response.getBody());

                if (status == HttpStatus.CREATED) {
                    created++;
                    winningReference = body.get("reference").asText();
                    assertThat(winningReference).matches(REFERENCE_FORMAT);
                    assertThat(body.get("status").asText()).isEqualTo("CONFIRMED");
                } else if (status == HttpStatus.CONFLICT) {
                    conflicts++;
                    // every loser loses to the business rule, not to infrastructure
                    assertThat(body.get("error").asText()).isEqualTo("BOOKING_UNAVAILABLE");
                } else {
                    unexpected.add(status.value() + ": " + body.get("error").asText());
                }
            }

            assertThat(unexpected).as("no 5xx, no lock timeouts, no surprises").isEmpty();
            assertThat(created).as("exactly one guest wins the room").isEqualTo(1);
            assertThat(conflicts).as("everyone else gets the business 409").isEqualTo(RACERS - 1);
            assertThat(winningReference).as("the winner is known and persisted").isNotNull();

            // and the database agrees: exactly one row in the raced window
            Integer persisted = jdbc.queryForObject(
                    "select count(*) from bookings where room_type_id = ?",
                    Integer.class, roomTypeId);
            assertThat(persisted).isEqualTo(1);
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
}
