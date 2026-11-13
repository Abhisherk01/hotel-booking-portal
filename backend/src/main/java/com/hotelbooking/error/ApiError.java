package com.hotelbooking.error;

import java.time.Clock;
import java.time.OffsetDateTime;

/**
 * The error body every failure path returns: {timestamp, status, error,
 * message, path}. timestamp is rendered in the business timezone so a
 * support conversation in India reads the same clock the booking used.
 */
public record ApiError(OffsetDateTime timestamp, int status, String error, String message, String path) {

    public static ApiError of(org.springframework.http.HttpStatus status, String code,
                              String message, String path, Clock clock) {
        return new ApiError(OffsetDateTime.now(clock), status.value(), code, message, path);
    }
}
