package com.hotelbooking.error;

import org.springframework.http.HttpStatus;

public class BadRequestApiException extends ApiException {

    public BadRequestApiException(String message) {
        super(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", message);
    }
}
