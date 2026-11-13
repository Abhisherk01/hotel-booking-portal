package com.hotelbooking.dto;

import com.hotelbooking.domain.Hotel;

import java.util.List;

/**
 * The browse-card view of a hotel. Amenities are sorted so the JSON is
 * stable across calls - the collection underneath is a HashSet. imageUrl
 * may be null while photography is pending; clients fall back locally.
 */
public record HotelSummaryDto(Long id, String name, String city, String description,
                              String imageUrl, List<String> amenities) {

    public static HotelSummaryDto from(Hotel hotel) {
        return new HotelSummaryDto(hotel.getId(), hotel.getName(), hotel.getCity(),
                hotel.getDescription(), hotel.getImageUrl(),
                hotel.getAmenities().stream().sorted().toList());
    }
}
