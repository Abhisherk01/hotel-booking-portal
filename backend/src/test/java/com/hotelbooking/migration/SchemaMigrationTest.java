package com.hotelbooking.migration;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Exercises the migration output itself - what Flyway actually created -
 * rather than the JPA layer on top of it. Runs against whatever datasource
 * the active profile provides: in-memory H2 (MySQL mode) by default, real
 * MySQL when launched with SPRING_PROFILES_ACTIVE=mysql.
 */
@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
class SchemaMigrationTest {

    @Autowired
    private JdbcTemplate jdbc;

    @Test
    void allMigrationsAreRecordedAsApplied() {
        // rank -1 is Flyway's own "history table created" marker row (null
        // version); real migrations carry positive ranks.
        List<Map<String, Object>> applied = jdbc.queryForList(
                "select version from flyway_schema_history where success = true and version is not null order by installed_rank");
        assertThat(applied)
                .extracting(row -> String.valueOf(row.get("version")))
                .containsExactly("1", "2", "3");
    }

    @Test
    void allFourTablesExist() {
        for (String table : List.of("hotels", "hotel_amenities", "room_types", "bookings")) {
            Integer found = jdbc.queryForObject(
                    // information_schema identifier casing differs per engine; compare case-blind
                    "select count(*) from information_schema.tables where upper(table_name) = upper(?)",
                    Integer.class, table);
            assertThat(found).as("table %s should exist", table).isEqualTo(1);
        }
    }

    @Test
    void stayDatesMustHavePositiveNights() {
        LocalDate day = LocalDate.of(2026, 4, 10);
        assertThatThrownBy(() -> insertBooking("HB-PROBE01", day, day, "CONFIRMED", null))
                .isInstanceOf(DataAccessException.class);
    }

    @Test
    void unknownStatusesAreRejected() {
        assertThatThrownBy(() -> insertBooking("HB-PROBE02",
                LocalDate.of(2026, 4, 10), LocalDate.of(2026, 4, 12), "PENDING", null))
                .isInstanceOf(DataAccessException.class);
    }

    @Test
    void confirmedRowsCannotCarryACancellationTimestamp() {
        assertThatThrownBy(() -> insertBooking("HB-PROBE03",
                LocalDate.of(2026, 4, 10), LocalDate.of(2026, 4, 12),
                "CONFIRMED", LocalDateTime.of(2026, 4, 1, 10, 0)))
                .isInstanceOf(DataAccessException.class);
    }

    @Test
    void amenityPairsAreUniquePerHotel() {
        jdbc.update("insert into hotel_amenities (hotel_id, amenity) values (?, ?)", 1L, "Probe Amenity");
        assertThatThrownBy(() ->
                jdbc.update("insert into hotel_amenities (hotel_id, amenity) values (?, ?)", 1L, "Probe Amenity"))
                .isInstanceOf(DataAccessException.class);
    }

    private void insertBooking(String reference, LocalDate checkIn, LocalDate checkOut,
                               String status, LocalDateTime cancelledAt) {
        jdbc.update("""
                insert into bookings (booking_reference, room_type_id, guest_name, guest_email,
                                      check_in, check_out, status, price_per_night_snapshot,
                                      total_amount, cancelled_at)
                values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                reference, 1L, "Schema Probe", "probe@example.com", checkIn, checkOut,
                status, new BigDecimal("100.00"), new BigDecimal("100.00"), cancelledAt);
    }
}
