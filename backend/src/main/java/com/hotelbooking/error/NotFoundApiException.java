package com.hotelbooking.error;

import org.springframework.http.HttpStatus;

/**
 * Every 404 the API returns carries the same body, whether the unknown
 * thing is a hotel, a booking reference or the path itself. Answering
 * "no booking with that reference" differently from "no such hotel"
 * would tell an attacker which references are worth attacking.
 */
public class NotFoundApiException extends ApiException {

    private static final String GENERIC_MESSAGE = "The requested resource was not found.";

    public NotFoundApiException() {
        super(HttpStatus.NOT_FOUND, "NOT_FOUND", GENERIC_MESSAGE);
    }
}
