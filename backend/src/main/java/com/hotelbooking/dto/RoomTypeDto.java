package com.hotelbooking.dto;

import com.hotelbooking.domain.RoomType;

import java.math.BigDecimal;

public record RoomTypeDto(Long id, String name, int capacity, BigDecimal pricePerNight) {

    public static RoomTypeDto from(RoomType roomType) {
        return new RoomTypeDto(roomType.getId(), roomType.getName(),
                roomType.getCapacity(), roomType.getPricePerNight());
    }
}
