package com.hotelbooking.dto;

import java.time.LocalDate;
import java.util.List;

public record HotelAvailabilityDto(Long hotelId, String hotelName, String city,
                                   LocalDate checkIn, LocalDate checkOut,
                                   List<RoomAvailabilityDto> roomTypes) {
}
