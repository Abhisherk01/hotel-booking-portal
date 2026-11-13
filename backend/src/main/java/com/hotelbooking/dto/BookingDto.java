package com.hotelbooking.dto;

import com.hotelbooking.domain.Booking;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * The guest-facing view of a booking. pricePerNight and totalAmount come
 * from the snapshot columns - what the guest agreed to pay at creation,
 * not the room category's current price.
 */
public record BookingDto(String reference, Long hotelId, String hotelName,
                         Long roomTypeId, String roomTypeName,
                         String guestName, String guestEmail,
                         LocalDate checkIn, LocalDate checkOut, String status,
                         BigDecimal pricePerNight, BigDecimal totalAmount,
                         LocalDateTime createdAt, LocalDateTime cancelledAt) {

    public static BookingDto from(Booking booking) {
        var roomType = booking.getRoomType();
        var hotel = roomType.getHotel();
        return new BookingDto(
                booking.getBookingReference(),
                hotel.getId(), hotel.getName(),
                roomType.getId(), roomType.getName(),
                booking.getGuestName(), booking.getGuestEmail(),
                booking.getCheckIn(), booking.getCheckOut(),
                booking.getStatus().name(),
                booking.getPricePerNightSnapshot(), booking.getTotalAmount(),
                booking.getCreatedAt(), booking.getCancelledAt());
    }
}
