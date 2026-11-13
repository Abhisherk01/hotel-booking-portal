package com.hotelbooking.domain;

/**
 * Lifecycle of a booking. CONFIRMED means the room is held for the stay;
 * CANCELLED is terminal - a cancelled booking never returns to CONFIRMED,
 * it simply releases the room for new reservations.
 */
public enum BookingStatus {
    CONFIRMED,
    CANCELLED
}
