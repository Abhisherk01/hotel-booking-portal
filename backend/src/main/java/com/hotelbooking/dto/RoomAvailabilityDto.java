package com.hotelbooking.dto;

import java.math.BigDecimal;

/**
 * One room category inside an availability answer. availableUnits is what
 * is left after subtracting confirmed overlapping stays from capacity;
 * with the current one-room inventory it is simply 1 or 0.
 */
public record RoomAvailabilityDto(Long roomTypeId, String name, int capacity,
                                  BigDecimal pricePerNight, int availableUnits, boolean available) {
}
