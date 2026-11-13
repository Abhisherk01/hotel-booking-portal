package com.hotelbooking.repository;

import com.hotelbooking.domain.Booking;
import com.hotelbooking.domain.BookingStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.Optional;

public interface BookingRepository extends JpaRepository<Booking, Long> {

    Optional<Booking> findByBookingReference(String bookingReference);

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
