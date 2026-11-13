package com.hotelbooking.api;

import com.hotelbooking.dto.BookingDto;
import com.hotelbooking.dto.BookingLookupRequest;
import com.hotelbooking.dto.BookingRequest;
import com.hotelbooking.dto.PriceQuoteDto;
import com.hotelbooking.dto.PriceQuoteRequest;
import com.hotelbooking.service.BookingService;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/bookings")
public class BookingController {

    private final BookingService bookings;

    public BookingController(BookingService bookings) {
        this.bookings = bookings;
    }

    /** Lookup goes through POST so the reference never sits in a URL, log line or referrer header. */
    @PostMapping("/lookup")
    public BookingDto lookup(@Valid @RequestBody BookingLookupRequest request) {
        return bookings.lookup(request);
    }

    @PostMapping("/price-quote")
    public PriceQuoteDto quote(@Valid @RequestBody PriceQuoteRequest request) {
        return bookings.quote(request);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public BookingDto create(@Valid @RequestBody BookingRequest request) {
        return bookings.create(request);
    }

    @PostMapping("/{reference}/cancel")
    public BookingDto cancel(@PathVariable String reference) {
        return bookings.cancel(reference);
    }
}
