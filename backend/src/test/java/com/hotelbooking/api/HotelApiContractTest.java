package com.hotelbooking.api;

import java.time.Clock;
import java.time.LocalDate;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The hotel half of the REST contract, over HTTP against the real handler
 * stack (MockMvc drives the genuine DispatcherServlet - filters, validation,
 * exception advice, all of it).
 *
 * Every test runs inside one transaction that rolls back at the end, so the
 * suite is repeatable and order-independent by construction and never
 * touches the seeded catalogue's survival.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class HotelApiContractTest {

    private static final String GENERIC_404_MESSAGE = "The requested resource was not found.";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper mapper;

    @Autowired
    private Clock clock;

    private JsonNode bodyOf(MvcResult result) throws Exception {
        return mapper.readTree(result.getResponse().getContentAsString());
    }

    @Test
    void listsAllFiveSeedHotelsWithSortedAmenities() throws Exception {
        MvcResult result = mockMvc.perform(get("/api/hotels"))
                .andExpect(status().isOk())
                .andReturn();

        JsonNode hotels = bodyOf(result);
        assertThat(hotels.isArray()).isTrue();
        assertThat(hotels.size()).isEqualTo(5);

        // locate by id: findAll() has no ORDER BY, so scan order is the engine's
        // business and the test does not lean on it
        JsonNode jaipur = null;
        for (JsonNode hotel : hotels) {
            if (hotel.get("id").asLong() == 1L) {
                jaipur = hotel;
            }
        }
        assertThat(jaipur).as("hotel 1 (Jaipur) is in the catalogue").isNotNull();
        assertThat(jaipur.get("name").asText()).isEqualTo("Hawa Mahal Courtyard Haveli");
        assertThat(jaipur.get("city").asText()).isEqualTo("Jaipur");

        // photography is pending: the field exists, the value may be null,
        // and the client is expected to fall back to its own asset
        assertThat(jaipur.has("imageUrl")).isTrue();
        assertThat(jaipur.get("imageUrl").isNull()).isTrue();

        JsonNode amenities = jaipur.get("amenities");
        assertThat(amenities.size()).isEqualTo(6);
        assertThat(amenities.get(0).asText()).isEqualTo("Air Conditioning");
    }

    @Test
    void everyResponseCarriesTheSecurityHeaders() throws Exception {
        // pins the real registration (SecurityHeadersConfig through the live
        // filter chain), not just the filter class - a broken FilterRegistrationBean
        // would pass the unit test and fail here
        MvcResult result = mockMvc.perform(get("/api/hotels"))
                .andExpect(status().isOk())
                .andReturn();

        assertThat(result.getResponse().getHeader("X-Content-Type-Options")).isEqualTo("nosniff");
        assertThat(result.getResponse().getHeader("X-Frame-Options")).isEqualTo("DENY");
        assertThat(result.getResponse().getHeader("Referrer-Policy")).isEqualTo("strict-origin-when-cross-origin");
    }

    @Test
    void hotelDetailCarriesItsRoomCategory() throws Exception {
        MvcResult result = mockMvc.perform(get("/api/hotels/1"))
                .andExpect(status().isOk())
                .andReturn();

        JsonNode hotel = bodyOf(result);
        assertThat(hotel.get("id").asLong()).isEqualTo(1L);
        assertThat(hotel.get("description").asText()).contains("haveli");

        JsonNode roomTypes = hotel.get("roomTypes");
        assertThat(roomTypes.size()).isEqualTo(1);
        assertThat(roomTypes.get(0).get("name").asText()).isEqualTo("Heritage Courtyard Room");
        assertThat(roomTypes.get(0).get("capacity").asInt()).isEqualTo(1);
        assertThat(roomTypes.get(0).get("pricePerNight").decimalValue()).isEqualByComparingTo("8500.00");
    }

    @Test
    void unknownHotelReturnsTheGenericNotFound() throws Exception {
        MvcResult result = mockMvc.perform(get("/api/hotels/999"))
                .andExpect(status().isNotFound())
                .andReturn();

        JsonNode body = bodyOf(result);
        assertThat(body.get("error").asText()).isEqualTo("NOT_FOUND");
        assertThat(body.get("message").asText()).isEqualTo(GENERIC_404_MESSAGE);
        assertThat(body.get("path").asText()).isEqualTo("/api/hotels/999");
    }

    @Test
    void citySearchMatchesCaseBlind() throws Exception {
        MvcResult result = mockMvc.perform(get("/api/hotels/search").param("city", "jaipur"))
                .andExpect(status().isOk())
                .andReturn();

        JsonNode found = bodyOf(result);
        assertThat(found.size()).isEqualTo(1);
        assertThat(found.get(0).get("city").asText()).isEqualTo("Jaipur");
    }

    @Test
    void missingCityParameterIsAValidationError() throws Exception {
        MvcResult result = mockMvc.perform(get("/api/hotels/search"))
                .andExpect(status().isBadRequest())
                .andReturn();

        JsonNode body = bodyOf(result);
        assertThat(body.get("error").asText()).isEqualTo("VALIDATION_ERROR");
        assertThat(body.get("message").asText()).isEqualTo("Required parameter 'city' is missing.");
    }

    @Test
    void blankCityParameterIsAValidationError() throws Exception {
        MvcResult result = mockMvc.perform(get("/api/hotels/search").param("city", ""))
                .andExpect(status().isBadRequest())
                .andReturn();

        JsonNode body = bodyOf(result);
        assertThat(body.get("error").asText()).isEqualTo("VALIDATION_ERROR");
        assertThat(body.get("message").asText()).isEqualTo("The 'city' parameter is required.");
    }

    @Test
    void availabilityEchoesTheWindowAndReportsFreeUnits() throws Exception {
        LocalDate checkIn = LocalDate.now(clock).plusDays(30);
        LocalDate checkOut = checkIn.plusDays(2);

        MvcResult result = mockMvc.perform(get("/api/hotels/1/availability")
                        .param("checkIn", checkIn.toString())
                        .param("checkOut", checkOut.toString()))
                .andExpect(status().isOk())
                .andReturn();

        JsonNode answer = bodyOf(result);
        assertThat(answer.get("hotelId").asLong()).isEqualTo(1L);
        assertThat(answer.get("hotelName").asText()).isEqualTo("Hawa Mahal Courtyard Haveli");
        assertThat(answer.get("checkIn").asText()).isEqualTo(checkIn.toString());
        assertThat(answer.get("checkOut").asText()).isEqualTo(checkOut.toString());

        JsonNode room = answer.get("roomTypes").get(0);
        assertThat(room.get("availableUnits").asInt()).isEqualTo(1);
        assertThat(room.get("available").asBoolean()).isTrue();
    }

    @Test
    void reversedAvailabilityDatesAreRejected() throws Exception {
        LocalDate day = LocalDate.now(clock).plusDays(30);

        MvcResult result = mockMvc.perform(get("/api/hotels/1/availability")
                        .param("checkIn", day.toString())
                        .param("checkOut", day.toString()))
                .andExpect(status().isBadRequest())
                .andReturn();

        JsonNode body = bodyOf(result);
        assertThat(body.get("error").asText()).isEqualTo("VALIDATION_ERROR");
        assertThat(body.get("message").asText()).isEqualTo("checkOut must be after checkIn.");
    }

    @Test
    void unparseableAvailabilityDateIsAValidationError() throws Exception {
        LocalDate checkOut = LocalDate.now(clock).plusDays(32);

        MvcResult result = mockMvc.perform(get("/api/hotels/1/availability")
                        .param("checkIn", "not-a-date")
                        .param("checkOut", checkOut.toString()))
                .andExpect(status().isBadRequest())
                .andReturn();

        JsonNode body = bodyOf(result);
        assertThat(body.get("error").asText()).isEqualTo("VALIDATION_ERROR");
        assertThat(body.get("message").asText())
                .isEqualTo("Parameter 'checkIn' has an invalid value or format.");
    }

    @Test
    void availabilityForUnknownHotelIsGenericNotFound() throws Exception {
        LocalDate checkIn = LocalDate.now(clock).plusDays(30);

        MvcResult result = mockMvc.perform(get("/api/hotels/999/availability")
                        .param("checkIn", checkIn.toString())
                        .param("checkOut", checkIn.plusDays(2).toString()))
                .andExpect(status().isNotFound())
                .andReturn();

        JsonNode body = bodyOf(result);
        assertThat(body.get("error").asText()).isEqualTo("NOT_FOUND");
        assertThat(body.get("message").asText()).isEqualTo(GENERIC_404_MESSAGE);
    }
}
