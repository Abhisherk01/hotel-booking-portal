package com.hotelbooking.migration;

import com.hotelbooking.domain.Hotel;
import com.hotelbooking.domain.RoomType;
import com.hotelbooking.repository.HotelRepository;
import com.hotelbooking.repository.RoomTypeRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Asserts the shape of the seeded catalogue: five properties on the classic
 * circuit, one room category each, amenities as a normalized collection.
 */
@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
class SeedDataTest {

    @Autowired
    private HotelRepository hotels;

    @Autowired
    private RoomTypeRepository roomTypes;

    @Test
    void seedsTheFiveCircuitHotels() {
        assertThat(hotels.count()).isEqualTo(5);
        assertThat(hotels.findAll())
                .extracting(Hotel::getCity)
                .containsExactlyInAnyOrder("Jaipur", "Udaipur", "Goa", "Kochi", "Manali");
    }

    @Test
    void everyHotelCarriesFiveToSevenDistinctAmenities() {
        for (Hotel hotel : hotels.findAll()) {
            assertThat(hotel.getAmenities())
                    .as("amenities of %s", hotel.getName())
                    .hasSizeBetween(5, 7)
                    .doesNotHaveDuplicates();
        }
    }

    @Test
    void everyHotelHasExactlyOneCategoryWithCapacityOne() {
        assertThat(roomTypes.count()).isEqualTo(5);

        for (Hotel hotel : hotels.findAll()) {
            List<RoomType> categories = roomTypes.findByHotelId(hotel.getId());
            assertThat(categories).as("categories of %s", hotel.getName()).hasSize(1);

            RoomType category = categories.get(0);
            assertThat(category.getCapacity()).isEqualTo(1);
            assertThat(category.getPricePerNight()).isPositive();
            assertThat(category.getPricePerNight().scale()).isEqualTo(2);
        }
    }
}
