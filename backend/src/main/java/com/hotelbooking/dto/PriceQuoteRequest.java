package com.hotelbooking.dto;

import jakarta.validation.constraints.NotNull;

import java.time.LocalDate;

public record PriceQuoteRequest(
        @NotNull Long roomTypeId,
        @NotNull LocalDate checkIn,
        @NotNull LocalDate checkOut) {
}
