package com.hotelbooking.dto;

import com.hotelbooking.domain.Hotel;

import java.util.List;

/**
 * The browse-card view of a hotel. Amenities are sorted so the JSON is
 * stable across calls - the collection underneath is a HashSet.
 */
public record HotelSummaryDto(Long id, String name, String city, String description,
                              List<String> amenities) {

    public static HotelSummaryDto from(Hotel hotel) {
        return new HotelSummaryDto(hotel.getId(), hotel.getName(), hotel.getCity(),
                hotel.getDescription(),
                hotel.getAmenities().stream().sorted().toList());
    }
}
