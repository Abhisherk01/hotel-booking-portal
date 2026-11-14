package com.hotelbooking.repository;

import com.hotelbooking.domain.Booking;
import com.hotelbooking.domain.BookingStatus;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Optional;

public interface BookingRepository extends JpaRepository<Booking, Long> {

    Optional<Booking> findByBookingReference(String bookingReference);

    /**
     * Locking read of the booking row (SELECT ... FOR UPDATE on H2 and on
     * MySQL/InnoDB). After the cancellation UPDATE this is the only read
     * shape that is allowed to decide 404 vs 409: a locking read is served
     * from the row's latest committed version, while a plain consistent
     * read inside a REPEATABLE-READ transaction would serve the
     * transaction's snapshot - which can still show CONFIRMED after
     * another racer's cancel has already committed (InnoDB probe: plain
     * read CANCELLED-vs-CONFIRMED divergence, see docs/TESTING.md).
     * Lookup deliberately keeps the plain read - it changes nothing and
     * has no reason to block.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select b from Booking b where b.bookingReference = :reference")
    Optional<Booking> findByReferenceForUpdate(@Param("reference") String reference);

    /**
     * THE cancellation write: one atomic state transition, decided by the
     * row itself. The UPDATE matches only while the row is still
     * CONFIRMED and only for the reference+email pair, and InnoDB
     * evaluates that WHERE clause against the row's latest committed
     * version while holding the row's exclusive lock - so however the
     * racers' reads interleaved, exactly one of them can flip CONFIRMED
     * to CANCELLED. Everyone else matches zero rows and is answered 409
     * (or the generic 404 when their email did not match). This does not
     * depend on read-side lock discipline at all: even two connections
     * firing this exact statement at the same instant cannot both see
     * affected rows = 1 (InnoDB probe: 1 + 0, on MySQL 8.4.13
     * REPEATABLE-READ).
     *
     * The email comparison mirrors Booking.matchesGuestEmail:
     * case-insensitive on both sides (LOWER), so "Meera@Example.in" and
     * "meera@example.in" cancel the same booking. The reference keeps its
     * role as the row locator; the email keeps its role as the authority
     * check - a reference alone can never cancel.
     *
     * Persistence-context hygiene for the bulk update: flushAutomatically
     * pushes any pending changes before the SQL fires (none are pending
     * on this path today, but the flag keeps the statement safe if the
     * flow ever grows one), and clearAutomatically evicts the persistence
     * context afterwards, so the winner's follow-up read is guaranteed to
     * build the response from a freshly loaded entity, never from a stale
     * managed snapshot.
     */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("""
            update Booking b
            set b.status = com.hotelbooking.domain.BookingStatus.CANCELLED,
                b.cancelledAt = :cancelledAt
            where b.bookingReference = :reference
              and lower(b.guestEmail) = lower(:guestEmail)
              and b.status = com.hotelbooking.domain.BookingStatus.CONFIRMED
            """)
    int cancelConfirmedBooking(@Param("reference") String reference,
                               @Param("guestEmail") String guestEmail,
                               @Param("cancelledAt") LocalDateTime cancelledAt);

    /**
     * Stays are half-open ranges [check_in, check_out): a booking conflicts
     * when it starts before the requested window ends and ends after the
     * window starts. Same-day turnover therefore does not conflict - one
     * guest's check-out can be the next guest's check-in.
     */
    @Query("""
            select count(b) from Booking b
            where b.roomType.id = :roomTypeId
              and b.status = :status
              and b.checkIn < :checkOut
              and b.checkOut > :checkIn
            """)
    long countOverlappingBookings(@Param("roomTypeId") Long roomTypeId,
                                  @Param("status") BookingStatus status,
                                  @Param("checkIn") LocalDate checkIn,
                                  @Param("checkOut") LocalDate checkOut);
}
