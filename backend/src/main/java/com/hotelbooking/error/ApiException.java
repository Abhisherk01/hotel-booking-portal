package com.hotelbooking.error;

import org.springframework.http.HttpStatus;

/**
 * Base for every error the API admits to deliberately. code is the stable,
 * machine-readable token the frontend branches on; message is what a human
 * reads. Anything outside this hierarchy falls through to the handler's
 * 500 catch-all, which reveals nothing.
 */
public abstract class ApiException extends RuntimeException {

    private final HttpStatus status;
    private final String code;

    protected ApiException(HttpStatus status, String code, String message) {
        super(message);
        this.status = status;
        this.code = code;
    }

    public HttpStatus getStatus() {
        return status;
    }

    public String getCode() {
        return code;
    }
}
