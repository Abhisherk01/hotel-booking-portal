package com.hotelbooking.error;

import org.springframework.http.HttpStatus;

/**
 * 409 with a specific code: BOOKING_UNAVAILABLE when another guest won the
 * room, BOOKING_ALREADY_CANCELLED when cancellation hits a terminal state.
 */
public class ConflictApiException extends ApiException {

    public ConflictApiException(String code, String message) {
        super(HttpStatus.CONFLICT, code, message);
    }
}
