package com.hotelbooking.service;

import org.junit.jupiter.api.Test;

import java.util.HashSet;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Pins the reference format the API contract promises: "HB-" plus nine
 * characters a human can read aloud over the phone - no 0/O, no 1/I
 * look-alikes - and uniqueness at volumes far beyond anything this portal
 * will ever see.
 */
class BookingReferenceGeneratorTest {

    private final BookingReferenceGenerator generator = new BookingReferenceGenerator();

    @Test
    void referencesMatchTheTranscribableFormat() {
        for (int i = 0; i < 500; i++) {
            String reference = generator.next();
            assertThat(reference).matches("HB-[2-9A-HJ-NP-Z]{9}");
            assertThat(reference).hasSize(12); // fits the column limit exactly
            assertThat(reference).doesNotContain("0", "1", "I", "O");
        }
    }

    @Test
    void alphabetCarriesNoLookalikesAndVolumeStaysUnique() {
        // the alphabet itself is pinned: 32 characters, look-alikes excluded
        assertThat(BookingReferenceGenerator.ALPHABET)
                .isEqualTo("23456789ABCDEFGHJKLMNPQRSTUVWXYZ")
                .doesNotContain("0", "1", "I", "O");

        Set<String> seen = new HashSet<>();
        for (int i = 0; i < 10_000; i++) {
            seen.add(generator.next());
        }
        assertThat(seen).hasSize(10_000);
    }
}
