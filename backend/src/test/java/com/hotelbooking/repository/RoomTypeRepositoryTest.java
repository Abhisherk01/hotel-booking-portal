package com.hotelbooking.repository;

import com.hotelbooking.domain.RoomType;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Smoke-level coverage for the repository methods the booking path depends
 * on; the true concurrency regression (two writers, one room) is a Phase 4
 * test once BookingService exists to race against itself.
 */
@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
class RoomTypeRepositoryTest {

    @Autowired
    private RoomTypeRepository roomTypes;

    @Test
    void forUpdateReaderReturnsTheRow() {
        RoomType locked = roomTypes.findByIdForUpdate(1L).orElseThrow();
        assertThat(locked.getName()).isEqualTo("Heritage Courtyard Room");
        assertThat(locked.getPricePerNight()).isEqualByComparingTo("8500.00");
    }

    @Test
    void categoriesAreListableByHotel() {
        assertThat(roomTypes.findByHotelId(1L)).hasSize(1);
        assertThat(roomTypes.findByHotelId(999L)).isEmpty();
    }
}
