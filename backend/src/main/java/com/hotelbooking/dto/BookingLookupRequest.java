package com.hotelbooking.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record BookingLookupRequest(
        @NotBlank @Size(max = 12) String reference) {
}
