package com.hotelbooking.repository;

import com.hotelbooking.domain.Booking;
import com.hotelbooking.domain.BookingStatus;
import com.hotelbooking.domain.RoomType;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.dao.DataIntegrityViolationException;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Round-trips a booking through the repository and pins down the overlap
 * semantics that the availability decision (Phase 3) will lean on.
 */
@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
class BookingRepositoryTest {

    private static final LocalDate APR_8 = LocalDate.of(2026, 4, 8);
    private static final LocalDate APR_10 = LocalDate.of(2026, 4, 10);
    private static final LocalDate APR_11 = LocalDate.of(2026, 4, 11);
    private static final LocalDate APR_12 = LocalDate.of(2026, 4, 12);
    private static final LocalDate APR_13 = LocalDate.of(2026, 4, 13);
    private static final LocalDate APR_14 = LocalDate.of(2026, 4, 14);

    @Autowired
    private BookingRepository bookings;

    @Autowired
    private RoomTypeRepository roomTypes;

    private Booking persistBooking(String reference, LocalDate checkIn, LocalDate checkOut) {
        RoomType category = roomTypes.findById(1L).orElseThrow();
        long nights = ChronoUnit.DAYS.between(checkIn, checkOut);
        return bookings.saveAndFlush(new Booking(category, reference, "Aman Verma", "aman@example.com",
                checkIn, checkOut, category.getPricePerNight(),
                category.getPricePerNight().multiply(BigDecimal.valueOf(nights))));
    }

    @Test
    void roundTripKeepsEveryFrozenField() {
        persistBooking("HB-RT1", APR_10, APR_12);

        Booking stored = bookings.findByBookingReference("HB-RT1").orElseThrow();
        assertThat(stored.getGuestName()).isEqualTo("Aman Verma");
        assertThat(stored.getGuestEmail()).isEqualTo("aman@example.com");
        assertThat(stored.getCheckIn()).isEqualTo(APR_10);
        assertThat(stored.getCheckOut()).isEqualTo(APR_12);
        assertThat(stored.getStatus()).isEqualTo(BookingStatus.CONFIRMED);
        assertThat(stored.getPricePerNightSnapshot()).isEqualByComparingTo("8500.00");
        assertThat(stored.getTotalAmount()).isEqualByComparingTo("17000.00");
        assertThat(stored.getCreatedAt()).isNotNull();
        assertThat(stored.getCancelledAt()).isNull();
        assertThat(stored.getRoomType().getId()).isEqualTo(1L);
    }

    @Test
    void duplicateReferencesAreRejectedByTheUniqueIndex() {
        persistBooking("HB-DUP", APR_10, APR_12);

        RoomType category = roomTypes.findById(1L).orElseThrow();
        Booking clash = new Booking(category, "HB-DUP", "Someone Else", "else@example.com",
                APR_10, APR_12, category.getPricePerNight(), category.getPricePerNight());

        assertThatThrownBy(() -> bookings.saveAndFlush(clash))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void overlapCountsRespectHalfOpenTurnover() {
        persistBooking("HB-OVL", APR_10, APR_12); // occupies the nights of the 10th and 11th

        assertThat(bookings.countOverlappingBookings(1L, BookingStatus.CONFIRMED, APR_10, APR_12)).isEqualTo(1);
        // checking out on the 12th frees the room for a check-in that same day
        assertThat(bookings.countOverlappingBookings(1L, BookingStatus.CONFIRMED, APR_12, APR_14)).isZero();
        // ditto on the front edge
        assertThat(bookings.countOverlappingBookings(1L, BookingStatus.CONFIRMED, APR_8, APR_10)).isZero();
        // genuine overlaps
        assertThat(bookings.countOverlappingBookings(1L, BookingStatus.CONFIRMED, APR_11, APR_13)).isEqualTo(1);
        assertThat(bookings.countOverlappingBookings(1L, BookingStatus.CONFIRMED, APR_10, APR_11)).isEqualTo(1);
        // a different category is untouched
        assertThat(bookings.countOverlappingBookings(2L, BookingStatus.CONFIRMED, APR_10, APR_12)).isZero();
    }

    @Test
    void cancelledBookingsReleaseTheRoom() {
        persistBooking("HB-CXL", APR_10, APR_12);
        assertThat(bookings.countOverlappingBookings(1L, BookingStatus.CONFIRMED, APR_10, APR_12)).isEqualTo(1);

        Booking stored = bookings.findByBookingReference("HB-CXL").orElseThrow();
        stored.markCancelled(LocalDateTime.now());
        bookings.saveAndFlush(stored);

        assertThat(bookings.countOverlappingBookings(1L, BookingStatus.CONFIRMED, APR_10, APR_12)).isZero();
        assertThat(bookings.countOverlappingBookings(1L, BookingStatus.CANCELLED, APR_10, APR_12)).isEqualTo(1);
        assertThat(bookings.findByBookingReference("HB-CXL").orElseThrow().getStatus())
                .isEqualTo(BookingStatus.CANCELLED);
    }
}
