package com.hotelbooking.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.Size;

/**
 * Cancellation verifies the same pair as lookup: reference in the path,
 * guest email in the body. Wrong email and unknown reference are
 * deliberately indistinguishable (the generic 404); an already-cancelled
 * booking is a 409, but only after the email has matched.
 */
public record BookingCancelRequest(
        @NotBlank @Email @Size(max = 160) String guestEmail) {
}
