package com.hotelbooking.service;

import java.time.Clock;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;

import com.hotelbooking.error.BadRequestApiException;

/**
 * Stay date rules shared by quoting, availability and booking. All "today"
 * judgments resolve through the injected business clock (Asia/Kolkata), so
 * the rules hold no matter which host the API runs on.
 */
public final class StayDates {

    /**
     * Upper bound on one stay, enforced everywhere StayDates.validate runs
     * (booking creation, price quotes and availability queries). Beyond the
     * guest-experience argument, the bound also keeps total_amount inside
     * its DECIMAL(10,2) column even at the highest seeded nightly rate, so
     * an absurd range fails as a clean 400 instead of a database error.
     */
    public static final int MAX_NIGHTS = 30;

    private StayDates() {
    }

    public static void validate(LocalDate checkIn, LocalDate checkOut, Clock clock) {
        if (checkIn.isBefore(LocalDate.now(clock))) {
            throw new BadRequestApiException("checkIn cannot be in the past.");
        }
        if (!checkOut.isAfter(checkIn)) {
            throw new BadRequestApiException("checkOut must be after checkIn.");
        }
        if (nights(checkIn, checkOut) > MAX_NIGHTS) {
            throw new BadRequestApiException("A stay can span at most " + MAX_NIGHTS + " nights.");
        }
    }

    /** Nights billed for a half-open stay [checkIn, checkOut). */
    public static long nights(LocalDate checkIn, LocalDate checkOut) {
        return ChronoUnit.DAYS.between(checkIn, checkOut);
    }
}
