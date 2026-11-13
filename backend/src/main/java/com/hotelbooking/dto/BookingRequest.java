package com.hotelbooking.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.LocalDate;

/**
 * Date order and past-date rules are checked in the service layer via
 * StayDates - one place, shared by quoting, availability and booking.
 */
public record BookingRequest(
        @NotNull Long roomTypeId,
        @NotBlank @Size(max = 120) String guestName,
        @NotBlank @Email @Size(max = 160) String guestEmail,
        @NotNull LocalDate checkIn,
        @NotNull LocalDate checkOut) {
}
