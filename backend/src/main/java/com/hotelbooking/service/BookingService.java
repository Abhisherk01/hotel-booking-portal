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
     *
     * The state transition itself is one atomic conditional UPDATE:
     * the statement matches the row by reference, by case-insensitive
     * guest email, and by status = CONFIRMED, and the database decides
     * the race - InnoDB evaluates the WHERE clause against the row's
     * latest committed version while holding the row's exclusive lock,
     * so of any number of simultaneous cancels exactly one can see
     * affected rows = 1. No read-side lock discipline is required for
     * correctness; the outcome is one-winner by construction.
     *
     * Affected rows drive everything afterwards. One row: the response is
     * built from a fresh read of the row just written (the bulk update
     * clears the persistence context, so no stale managed entity can
     * leak into the response). Zero rows: the caller either had the wrong
     * email, the wrong reference, or the booking is already cancelled -
     * classified by a SELECT ... FOR UPDATE read, which - unlike a plain
     * read under REPEATABLE-READ - always sees the latest committed row
     * rather than this transaction's snapshot. Wrong reference and wrong
     * email stay the same generic 404; an email-verified booking that is
     * already CANCELLED is the 409. The one state where the row still
     * reads CONFIRMED under our lock - a prior winner that rolled back
     * before committing - simply retries the guarded write, now holding
     * the lock itself.
     */
    @Transactional
    public BookingDto cancel(String reference, BookingCancelRequest request) {
        String normalizedReference = reference.trim();
        String guestEmail = request.guestEmail().trim();
        LocalDateTime cancelledAt = LocalDateTime.now(clock);

        if (bookings.cancelConfirmedBooking(normalizedReference, guestEmail, cancelledAt) == 1) {
            return BookingDto.from(bookings.findByBookingReference(normalizedReference)
                    .orElseThrow(NotFoundApiException::new));
        }

        Booking booking = bookings.findByReferenceForUpdate(normalizedReference)
                .orElseThrow(NotFoundApiException::new);
        if (!booking.matchesGuestEmail(request.guestEmail())) {
            throw new NotFoundApiException();
        }
        if (booking.getStatus() == BookingStatus.CANCELLED) {
            throw new ConflictApiException("BOOKING_ALREADY_CANCELLED",
                    "This booking was already cancelled.");
        }
        // the row is CONFIRMED and exclusively ours: the earlier UPDATE
        // lost to a transaction that rolled back instead of committing -
        // the guarded write can only succeed now
        if (bookings.cancelConfirmedBooking(normalizedReference, guestEmail, cancelledAt) == 1) {
            return BookingDto.from(bookings.findByBookingReference(normalizedReference)
                    .orElseThrow(NotFoundApiException::new));
        }
        throw new ConflictApiException("BOOKING_ALREADY_CANCELLED",
                "This booking was already cancelled.");
    }
}
