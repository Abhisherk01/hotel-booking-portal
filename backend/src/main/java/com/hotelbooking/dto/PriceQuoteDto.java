package com.hotelbooking.dto;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * A price calculation for a stay. Produced without touching availability -
 * quoting answers "what would it cost", availability answers "is it free".
 */
public record PriceQuoteDto(Long roomTypeId, String roomTypeName, Long hotelId, String hotelName,
                            LocalDate checkIn, LocalDate checkOut, long nights,
                            BigDecimal pricePerNight, BigDecimal totalAmount) {
}
