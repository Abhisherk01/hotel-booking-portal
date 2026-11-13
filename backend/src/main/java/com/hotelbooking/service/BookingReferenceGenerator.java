package com.hotelbooking.service;

import java.security.SecureRandom;

import org.springframework.stereotype.Component;

/**
 * Human-transcribable booking references: "HB-" plus nine characters from
 * an alphabet without look-alike glyphs (no 0/O, no 1/I), so a reference
 * can be read aloud over the phone. The 12-character column limit is met
 * exactly; the uq_bookings_reference unique index is the authority if a
 * collision ever does land, and at 32^9 possibilities that is an event
 * worth celebrating rather than retrying.
 */
@Component
public class BookingReferenceGenerator {

    static final String PREFIX = "HB-";
    static final String ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
    static final int LENGTH = 9;

    private final SecureRandom random = new SecureRandom();

    public String next() {
        char[] chars = new char[LENGTH];
        for (int i = 0; i < LENGTH; i++) {
            chars[i] = ALPHABET.charAt(random.nextInt(ALPHABET.length()));
        }
        return PREFIX + new String(chars);
    }
}
