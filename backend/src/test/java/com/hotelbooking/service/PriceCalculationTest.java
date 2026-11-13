package com.hotelbooking.service;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.LocalDate;

import com.hotelbooking.dto.BookingDto;
import com.hotelbooking.dto.BookingLookupRequest;
import com.hotelbooking.dto.BookingRequest;
import com.hotelbooking.dto.PriceQuoteDto;
import com.hotelbooking.dto.PriceQuoteRequest;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Price math and the frozen-quote promise.
 *
 * Quoting always follows the room category's CURRENT price. A booking
 * freezes what the guest agreed to pay, and no later repricing rewrites it -
 * while a booking made AFTER the reprice picks up the new price, because
 * the booking endpoint is where the authoritative amount is computed.
 *
 * The reprice runs as a bulk JPQL update: RoomType deliberately exposes no
 * price setter, so this test changes the database the way the application
 * would - no production code was bent to make it testable.
 */
@SpringBootTest
@Transactional
class PriceCalculationTest {

    @Autowired
    private BookingService bookingService;

    @Autowired
    private Clock clock;

    @PersistenceContext
    private EntityManager entityManager;

    private PriceQuoteDto quote(long roomTypeId, LocalDate checkIn, LocalDate checkOut) {
        return bookingService.quote(new PriceQuoteRequest(roomTypeId, checkIn, checkOut));
    }

    private BookingDto book(long roomTypeId, String guest, LocalDate checkIn, LocalDate checkOut) {
        return bookingService.create(new BookingRequest(roomTypeId, guest,
                guest.toLowerCase().replace(' ', '.') + "@example.in", checkIn, checkOut));
    }

    private void repriceRoomOne(String newPrice) {
        // canonical bulk-update hygiene: write any pending changes first,
        // execute the bulk statement, then detach everything so the next
        // service call reads the fresh price from the database
        entityManager.flush();
        entityManager.createQuery("update RoomType r set r.pricePerNight = :price where r.id = 1")
                .setParameter("price", new BigDecimal(newPrice))
                .executeUpdate();
        entityManager.clear();
    }

    @Test
    void aSingleNightStayIsBilledOnce() {
        LocalDate checkIn = LocalDate.now(clock).plusDays(1);

        PriceQuoteDto quote = quote(1L, checkIn, checkIn.plusDays(1));

        assertThat(quote.nights()).isEqualTo(1);
        assertThat(quote.pricePerNight()).isEqualByComparingTo("8500.00");
        assertThat(quote.totalAmount()).isEqualByComparingTo("8500.00");
    }

    @Test
    void multiNightStaysMultiplyByNights() {
        LocalDate checkIn = LocalDate.now(clock).plusDays(5);

        PriceQuoteDto quote = quote(1L, checkIn, checkIn.plusDays(3));

        assertThat(quote.nights()).isEqualTo(3);
        assertThat(quote.pricePerNight()).isEqualByComparingTo("8500.00");
        assertThat(quote.totalAmount()).isEqualByComparingTo("25500.00");
    }

    @Test
    void frozenSnapshotSurvivesRepricingOfTheCategory() {
        LocalDate checkIn = LocalDate.now(clock).plusDays(5);

        BookingDto original = book(1L, "Ravi Sharma", checkIn, checkIn.plusDays(3));
        assertThat(original.pricePerNight()).isEqualByComparingTo("8500.00");
        assertThat(original.totalAmount()).isEqualByComparingTo("25500.00");

        repriceRoomOne("9999.00");

        // quoting follows the current price...
        assertThat(quote(1L, checkIn, checkIn.plusDays(3)).totalAmount())
                .isEqualByComparingTo("29997.00");

        // ...while the booking keeps exactly what the guest agreed to pay
        BookingDto after = bookingService.lookup(new BookingLookupRequest(original.reference()));
        assertThat(after.pricePerNight()).isEqualByComparingTo("8500.00");
        assertThat(after.totalAmount()).isEqualByComparingTo("25500.00");
    }

    @Test
    void bookingsAfterTheRepriceTakeTheCurrentPrice() {
        LocalDate checkIn = LocalDate.now(clock).plusDays(6);
        repriceRoomOne("9999.00");

        BookingDto fresh = book(1L, "Ananya Rao", checkIn, checkIn.plusDays(2));

        assertThat(fresh.pricePerNight()).isEqualByComparingTo("9999.00");
        assertThat(fresh.totalAmount()).isEqualByComparingTo("19998.00");
    }
}
