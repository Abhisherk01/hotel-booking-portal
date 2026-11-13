package com.hotelbooking.dto;

import com.hotelbooking.domain.Hotel;

import java.util.List;

public record HotelDetailDto(Long id, String name, String city, String description,
                             List<String> amenities, List<RoomTypeDto> roomTypes) {

    public static HotelDetailDto from(Hotel hotel, List<RoomTypeDto> roomTypes) {
        return new HotelDetailDto(hotel.getId(), hotel.getName(), hotel.getCity(),
                hotel.getDescription(),
                hotel.getAmenities().stream().sorted().toList(),
                roomTypes);
    }
}
