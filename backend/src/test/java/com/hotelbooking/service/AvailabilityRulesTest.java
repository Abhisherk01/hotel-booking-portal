package com.hotelbooking.service;

import java.time.Clock;
import java.time.LocalDate;
import java.util.List;

import com.hotelbooking.dto.BookingDto;
import com.hotelbooking.dto.BookingRequest;
import com.hotelbooking.dto.HotelAvailabilityDto;
import com.hotelbooking.dto.PriceQuoteDto;
import com.hotelbooking.dto.PriceQuoteRequest;
import com.hotelbooking.dto.RoomAvailabilityDto;
import com.hotelbooking.error.ConflictApiException;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * The availability rules the API contract documents, exercised through the
 * service decisions rather than raw SQL counts (the repository truth table
 * already lives in BookingRepositoryTest):
 *
 *  - confirmed overlapping stays block the room, and the attempt is a 409
 *  - half-open edges stay bookable: checkout day and check-in day alike
 *  - same-day turnover hands one room from one guest to the next
 *  - cancellation returns the room to inventory immediately
 *  - quoting never gates on inventory; the booking endpoint rechecks
 */
@SpringBootTest
@Transactional
class AvailabilityRulesTest {

    private static final String REFERENCE_FORMAT = "HB-[2-9A-HJ-NP-Z]{9}";

    @Autowired
    private BookingService bookingService;

    @Autowired
    private HotelService hotelService;

    @Autowired
    private Clock clock;

    private LocalDate base() {
        return LocalDate.now(clock).plusDays(10);
    }

    private BookingDto book(String guest, LocalDate checkIn, LocalDate checkOut) {
        return bookingService.create(new BookingRequest(1L, guest,
                guest.toLowerCase().replace(' ', '.') + "@example.in", checkIn, checkOut));
    }

    private RoomAvailabilityDto roomOne(HotelAvailabilityDto availability) {
        List<RoomAvailabilityDto> rooms = availability.roomTypes();
        assertThat(rooms).hasSize(1);
        return rooms.get(0);
    }

    @Test
    void overlappingStaysBlockTheRoom() {
        LocalDate base = base();
        book("Aarav Gupta", base, base.plusDays(2));

        HotelAvailabilityDto during = hotelService.availability(1L, base.plusDays(1), base.plusDays(3));
        assertThat(roomOne(during).availableUnits()).isZero();
        assertThat(roomOne(during).available()).isFalse();

        assertThatThrownBy(() -> book("Diya Patel", base.plusDays(1), base.plusDays(3)))
                .isInstanceOfSatisfying(ConflictApiException.class,
                        conflict -> assertThat(conflict.getCode()).isEqualTo("BOOKING_UNAVAILABLE"));
    }

    @Test
    void adjacentEdgesStayBookable() {
        LocalDate base = base();
        book("Aarav Gupta", base, base.plusDays(2));

        // checkout day: the departing guest has already released the room
        HotelAvailabilityDto after = hotelService.availability(1L, base.plusDays(2), base.plusDays(4));
        assertThat(roomOne(after).availableUnits()).isEqualTo(1);
        assertThat(roomOne(after).available()).isTrue();

        // check-in day: a stay that ends before this window begins does not conflict
        HotelAvailabilityDto before = hotelService.availability(1L, base.minusDays(2), base);
        assertThat(roomOne(before).available()).isTrue();

        // and both edges are genuinely bookable, not just advertised
        assertThat(book("Diya Patel", base.plusDays(2), base.plusDays(4)).reference())
                .matches(REFERENCE_FORMAT);
        assertThat(book("Ishaan Singh", base.minusDays(2), base).reference())
                .matches(REFERENCE_FORMAT);
    }

    @Test
    void sameDayTurnoverHandsTheRoomFromOneGuestToTheNext() {
        LocalDate base = base();
        book("Aarav Gupta", base, base.plusDays(2));

        BookingDto next = book("Diya Patel", base.plusDays(2), base.plusDays(4));

        assertThat(next.status()).isEqualTo("CONFIRMED");
    }

    @Test
    void cancelledBookingsReleaseInventoryImmediately() {
        LocalDate base = base();
        BookingDto held = book("Aarav Gupta", base, base.plusDays(2));
        assertThat(roomOne(hotelService.availability(1L, base, base.plusDays(2))).availableUnits())
                .isZero();

        bookingService.cancel(held.reference());

        assertThat(roomOne(hotelService.availability(1L, base, base.plusDays(2))).available())
                .isTrue();

        BookingDto rebooked = book("Diya Patel", base, base.plusDays(2));
        assertThat(rebooked.status()).isEqualTo("CONFIRMED");
    }

    @Test
    void soldOutQuotesStayAdvisoryAndTheBookingEndpointRechecks() {
        LocalDate base = base();
        book("Aarav Gupta", base, base.plusDays(2));

        // quoting answers "what would it cost" and never asks "is it free"
        PriceQuoteDto quote = bookingService.quote(new PriceQuoteRequest(1L, base, base.plusDays(2)));
        assertThat(quote.totalAmount()).isEqualByComparingTo("17000.00");

        // the decision that cannot go stale happens under the row lock
        assertThatThrownBy(() -> book("Diya Patel", base, base.plusDays(2)))
                .isInstanceOfSatisfying(ConflictApiException.class,
                        conflict -> assertThat(conflict.getCode()).isEqualTo("BOOKING_UNAVAILABLE"));
    }

    @Test
    void availabilityCarriesPerRoomDetail() {
        LocalDate base = base();

        HotelAvailabilityDto answer = hotelService.availability(1L, base, base.plusDays(2));

        assertThat(answer.hotelId()).isEqualTo(1L);
        assertThat(answer.hotelName()).isEqualTo("Hawa Mahal Courtyard Haveli");
        assertThat(answer.city()).isEqualTo("Jaipur");
        assertThat(answer.checkIn()).isEqualTo(base);
        assertThat(answer.checkOut()).isEqualTo(base.plusDays(2));

        RoomAvailabilityDto room = roomOne(answer);
        assertThat(room.roomTypeId()).isEqualTo(1L);
        assertThat(room.name()).isEqualTo("Heritage Courtyard Room");
        assertThat(room.capacity()).isEqualTo(1);
        assertThat(room.pricePerNight()).isEqualByComparingTo("8500.00");
        assertThat(room.availableUnits()).isEqualTo(1);
        assertThat(room.available()).isTrue();
    }
}
