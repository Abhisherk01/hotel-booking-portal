package com.hotelbooking.error;

import java.time.Clock;
import java.util.stream.Collectors;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

import jakarta.servlet.http.HttpServletRequest;

/**
 * Turns every failure into the same envelope: {timestamp, status, error,
 * message, path}. Client mistakes (4xx) return without ceremony; anything
 * unexpected is logged with a stack trace server-side and reported to the
 * caller as a bare INTERNAL_ERROR - the envelope never carries internals.
 */
@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    private final Clock clock;

    public GlobalExceptionHandler(Clock clock) {
        this.clock = clock;
    }

    @ExceptionHandler(ApiException.class)
    public ResponseEntity<ApiError> onApiException(ApiException ex, HttpServletRequest request) {
        return respond(ex.getStatus(), ex.getCode(), ex.getMessage(), request);
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiError> onBodyValidation(MethodArgumentNotValidException ex,
                                                     HttpServletRequest request) {
        String detail = ex.getBindingResult().getFieldErrors().stream()
                .map(error -> error.getField() + ": " + error.getDefaultMessage())
                .distinct()
                .collect(Collectors.joining("; "));
        return respond(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", detail, request);
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<ApiError> onUnreadableBody(HttpMessageNotReadableException ex,
                                                     HttpServletRequest request) {
        return respond(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR",
                "Malformed or unreadable request body.", request);
    }

    @ExceptionHandler(MissingServletRequestParameterException.class)
    public ResponseEntity<ApiError> onMissingParameter(MissingServletRequestParameterException ex,
                                                       HttpServletRequest request) {
        return respond(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR",
                "Required parameter '" + ex.getParameterName() + "' is missing.", request);
    }

    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    public ResponseEntity<ApiError> onTypeMismatch(MethodArgumentTypeMismatchException ex,
                                                   HttpServletRequest request) {
        return respond(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR",
                "Parameter '" + ex.getName() + "' has an invalid value or format.", request);
    }

    @ExceptionHandler(NoResourceFoundException.class)
    public ResponseEntity<ApiError> onUnknownPath(NoResourceFoundException ex,
                                                  HttpServletRequest request) {
        return respond(HttpStatus.NOT_FOUND, "NOT_FOUND",
                "The requested resource was not found.", request);
    }

    @ExceptionHandler(HttpRequestMethodNotSupportedException.class)
    public ResponseEntity<ApiError> onMethodNotSupported(HttpRequestMethodNotSupportedException ex,
                                                         HttpServletRequest request) {
        return respond(HttpStatus.METHOD_NOT_ALLOWED, "METHOD_NOT_ALLOWED",
                "HTTP method not allowed for this endpoint.", request);
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiError> onUnexpected(Exception ex, HttpServletRequest request) {
        log.error("Unhandled exception on {} {}", request.getMethod(), request.getRequestURI(), ex);
        return respond(HttpStatus.INTERNAL_SERVER_ERROR, "INTERNAL_ERROR",
                "Unexpected server error.", request);
    }

    private ResponseEntity<ApiError> respond(HttpStatus status, String code, String message,
                                             HttpServletRequest request) {
        return ResponseEntity.status(status)
                .body(ApiError.of(status, code, message, request.getRequestURI(), clock));
    }
}
