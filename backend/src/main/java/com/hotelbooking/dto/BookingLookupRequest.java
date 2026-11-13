package com.hotelbooking.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.Size;

/**
 * Both halves are required: a reference alone no longer opens a booking.
 * A mismatch on either half answers the same generic 404, so a probe
 * cannot tell which of the two was wrong.
 */
public record BookingLookupRequest(
        @NotBlank @Size(max = 12) String reference,
        @NotBlank @Email @Size(max = 160) String guestEmail) {
}
