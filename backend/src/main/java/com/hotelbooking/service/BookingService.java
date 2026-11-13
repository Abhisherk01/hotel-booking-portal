package com.hotelbooking.service;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.LocalDateTime;
import java.time.LocalDate;

import com.hotelbooking.domain.Booking;
import com.hotelbooking.domain.BookingStatus;
import com.hotelbooking.domain.RoomType;
import com.hotelbooking.dto.BookingCancelRequest;
import com.hotelbooking.dto.BookingDto;
import com.hotelbooking.dto.BookingLookupRequest;
import com.hotelbooking.dto.BookingRequest;
import com.hotelbooking.dto.PriceQuoteDto;
import com.hotelbooking.dto.PriceQuoteRequest;
import com.hotelbooking.error.ConflictApiException;
import com.hotelbooking.error.NotFoundApiException;
import com.hotelbooking.repository.BookingRepository;
import com.hotelbooking.repository.RoomTypeRepository;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class BookingService {

    private final BookingRepository bookings;
    private final RoomTypeRepository roomTypes;
    private final BookingReferenceGenerator references;
    private final Clock clock;

    public BookingService(BookingRepository bookings, RoomTypeRepository roomTypes,
                          BookingReferenceGenerator references, Clock clock) {
        this.bookings = bookings;
        this.roomTypes = roomTypes;
        this.references = references;
        this.clock = clock;
    }

    /**
     * The booking transaction: lock the room-category row so concurrent
     * attempts serialize, recount confirmed overlaps while holding the
     * lock, compare against capacity, and only then persist. Losing the
     * race is a business outcome, not an error - hence 409 instead of 500.
     */
    @Transactional
    public BookingDto create(BookingRequest request) {
        LocalDate checkIn = request.checkIn();
        LocalDate checkOut = request.checkOut();
        StayDates.validate(checkIn, checkOut, clock);

        RoomType roomType = roomTypes.findByIdForUpdate(request.roomTypeId())
                .orElseThrow(NotFoundApiException::new);

        long held = bookings.countOverlappingBookings(
                roomType.getId(), BookingStatus.CONFIRMED, checkIn, checkOut);
        if (held >= roomType.getCapacity()) {
            throw new ConflictApiException("BOOKING_UNAVAILABLE",
                    "The room category is already booked for those dates.");
        }

        long nights = StayDates.nights(checkIn, checkOut);
        BigDecimal total = roomType.getPricePerNight().multiply(BigDecimal.valueOf(nights));

        Booking booking = new Booking(roomType, references.next(),
                request.guestName().trim(), request.guestEmail().trim(),
                checkIn, checkOut, roomType.getPricePerNight(), total);
        return BookingDto.from(bookings.save(booking));
    }

    @Transactional(readOnly = true)
    public PriceQuoteDto quote(PriceQuoteRequest request) {
        StayDates.validate(request.checkIn(), request.checkOut(), clock);
        RoomType roomType = roomTypes.findById(request.roomTypeId())
                .orElseThrow(NotFoundApiException::new);

        long nights = StayDates.nights(request.checkIn(), request.checkOut());
        BigDecimal total = roomType.getPricePerNight().multiply(BigDecimal.valueOf(nights));
        return new PriceQuoteDto(roomType.getId(), roomType.getName(),
                roomType.getHotel().getId(), roomType.getHotel().getName(),
                request.checkIn(), request.checkOut(), nights,
                roomType.getPricePerNight(), total);
    }

    /**
     * Lookup pairs the reference with the guest email and answers the same
     * generic 404 when either half is wrong, so nobody can probe which part
     * failed. References stay POST-bound: they never appear in a URL, an
     * access log or a Referrer header.
     */
    @Transactional(readOnly = true)
    public BookingDto lookup(BookingLookupRequest request) {
        Booking booking = bookings.findByBookingReference(request.reference().trim())
                .filter(candidate -> candidate.matchesGuestEmail(request.guestEmail()))
                .orElseThrow(NotFoundApiException::new);
        return BookingDto.from(booking);
    }

    /**
     * Cancellation is terminal; a second cancel is a conflict, not a reset.
     * The email is verified before that check fires - releasing someone
     * else's room by knowing only the reference is not a thing.
     */
    @Transactional
    public BookingDto cancel(String reference, BookingCancelRequest request) {
        Booking booking = bookings.findByBookingReference(reference.trim())
                .filter(candidate -> candidate.matchesGuestEmail(request.guestEmail()))
                .orElseThrow(NotFoundApiException::new);
        if (booking.getStatus() == BookingStatus.CANCELLED) {
            throw new ConflictApiException("BOOKING_ALREADY_CANCELLED",
                    "This booking was already cancelled.");
        }
        booking.markCancelled(LocalDateTime.now(clock));
        return BookingDto.from(bookings.save(booking));
    }
}
