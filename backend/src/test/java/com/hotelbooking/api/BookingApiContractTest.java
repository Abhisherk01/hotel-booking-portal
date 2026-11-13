package com.hotelbooking.api;

import java.time.Clock;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.Map;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The booking half of the REST contract, over HTTP against the real handler
 * stack. This class pins, endpoint by endpoint:
 *
 *  - the status codes the docs promise: 201 create, 200 quote/lookup/cancel,
 *    400 validation, 404 generic, 405 wrong verb, 409 sold-out or terminal
 *  - the five-field error envelope on every failure path, timestamp included
 *  - the existence-leak guard: unknown hotel, unknown-or-mismatched
 *    reference+email pair and unknown path all carry the identical generic
 *    404 body - the API never reveals which half of the pair was wrong
 *  - frozen-quote semantics visible from the outside: the create response's
 *    amounts are computed by the server, never supplied by the client
 *
 * Every test rolls back inside one transaction, so runs are repeatable and
 * independent of execution order.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class BookingApiContractTest {

    private static final String REFERENCE_FORMAT = "HB-[2-9A-HJ-NP-Z]{9}";
    private static final String GENERIC_404_MESSAGE = "The requested resource was not found.";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper mapper;

    @Autowired
    private Clock clock;

    private LocalDate soon(int daysAhead) {
        return LocalDate.now(clock).plusDays(daysAhead);
    }

    private JsonNode bodyOf(MvcResult result) throws Exception {
        return mapper.readTree(result.getResponse().getContentAsString());
    }

    private String jsonOf(Map<String, Object> payload) throws Exception {
        return mapper.writeValueAsString(payload);
    }

    private MvcResult createBooking(String guestName, String guestEmail,
                                    LocalDate checkIn, LocalDate checkOut) throws Exception {
        return mockMvc.perform(post("/api/bookings")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(jsonOf(Map.of(
                                "roomTypeId", 1,
                                "guestName", guestName,
                                "guestEmail", guestEmail,
                                "checkIn", checkIn.toString(),
                                "checkOut", checkOut.toString()))))
                .andReturn();
    }

    @Test
    void quotesTwoNightsAtTheCurrentPrice() throws Exception {
        LocalDate checkIn = soon(1);
        LocalDate checkOut = soon(3);

        MvcResult result = mockMvc.perform(post("/api/bookings/price-quote")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(jsonOf(Map.of(
                                "roomTypeId", 1,
                                "checkIn", checkIn.toString(),
                                "checkOut", checkOut.toString()))))
                .andExpect(status().isOk())
                .andReturn();

        JsonNode quote = bodyOf(result);
        assertThat(quote.get("roomTypeId").asLong()).isEqualTo(1L);
        assertThat(quote.get("roomTypeName").asText()).isEqualTo("Heritage Courtyard Room");
        assertThat(quote.get("hotelName").asText()).isEqualTo("Hawa Mahal Courtyard Haveli");
        assertThat(quote.get("nights").asLong()).isEqualTo(2L);
        assertThat(quote.get("pricePerNight").decimalValue()).isEqualByComparingTo("8500.00");
        assertThat(quote.get("totalAmount").decimalValue()).isEqualByComparingTo("17000.00");
    }

    @Test
    void unknownRoomTypeQuoteIsGenericNotFound() throws Exception {
        MvcResult result = mockMvc.perform(post("/api/bookings/price-quote")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(jsonOf(Map.of(
                                "roomTypeId", 999,
                                "checkIn", soon(1).toString(),
                                "checkOut", soon(3).toString()))))
                .andExpect(status().isNotFound())
                .andReturn();

        JsonNode body = bodyOf(result);
        assertThat(body.get("error").asText()).isEqualTo("NOT_FOUND");
        assertThat(body.get("message").asText()).isEqualTo(GENERIC_404_MESSAGE);
    }

    @Test
    void createsABookingTrimsGuestInputAndFreezesTheQuote() throws Exception {
        // captured once: if the business date rolled mid-test, request and
        // assertion would drift apart
        LocalDate checkIn = soon(1);
        LocalDate checkOut = soon(3);

        MvcResult result = createBooking("  Meera Iyer  ", "meera@example.in", checkIn, checkOut);
        assertThat(result.getResponse().getStatus()).isEqualTo(201);

        JsonNode booking = bodyOf(result);
        assertThat(booking.get("reference").asText()).matches(REFERENCE_FORMAT);
        assertThat(booking.get("status").asText()).isEqualTo("CONFIRMED");
        assertThat(booking.get("guestName").asText()).isEqualTo("Meera Iyer");
        assertThat(booking.get("guestEmail").asText()).isEqualTo("meera@example.in");
        assertThat(booking.get("hotelId").asLong()).isEqualTo(1L);
        assertThat(booking.get("hotelName").asText()).isEqualTo("Hawa Mahal Courtyard Haveli");
        assertThat(booking.get("roomTypeId").asLong()).isEqualTo(1L);
        assertThat(booking.get("roomTypeName").asText()).isEqualTo("Heritage Courtyard Room");
        assertThat(booking.get("checkIn").asText()).isEqualTo(checkIn.toString());
        assertThat(booking.get("checkOut").asText()).isEqualTo(checkOut.toString());
        assertThat(booking.get("pricePerNight").decimalValue()).isEqualByComparingTo("8500.00");
        assertThat(booking.get("totalAmount").decimalValue()).isEqualByComparingTo("17000.00");
        assertThat(booking.hasNonNull("createdAt")).isTrue();
        assertThat(booking.hasNonNull("cancelledAt")).isFalse();
    }

    @Test
    void soldOutRoomReturns409WithTheBusinessCode() throws Exception {
        createBooking("Meera Iyer", "meera@example.in", soon(1), soon(3));

        MvcResult second = createBooking("Vikram Rao", "vikram@example.in", soon(1), soon(3));
        assertThat(second.getResponse().getStatus()).isEqualTo(409);

        JsonNode body = bodyOf(second);
        assertThat(body.get("error").asText()).isEqualTo("BOOKING_UNAVAILABLE");
        assertThat(body.get("message").asText())
                .isEqualTo("The room category is already booked for those dates.");
        assertThat(body.get("path").asText()).isEqualTo("/api/bookings");
    }

    @Test
    void quoteRemainsAvailableOnASoldOutRoom() throws Exception {
        createBooking("Meera Iyer", "meera@example.in", soon(1), soon(3));

        // quoting answers "what would it cost" without ever asking "is it free"
        LocalDate checkIn = soon(1);
        LocalDate checkOut = soon(3);
        MvcResult quote = mockMvc.perform(post("/api/bookings/price-quote")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(jsonOf(Map.of(
                                "roomTypeId", 1,
                                "checkIn", checkIn.toString(),
                                "checkOut", checkOut.toString()))))
                .andExpect(status().isOk())
                .andReturn();

        assertThat(bodyOf(quote).get("totalAmount").decimalValue()).isEqualByComparingTo("17000.00");
    }

    @Test
    void lookupReturnsTheBookingBehindTheReference() throws Exception {
        MvcResult created = createBooking("Meera Iyer", "meera@example.in", soon(2), soon(4));
        String reference = bodyOf(created).get("reference").asText();

        MvcResult result = mockMvc.perform(post("/api/bookings/lookup")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(jsonOf(Map.of("reference", reference, "guestEmail", "meera@example.in"))))
                .andExpect(status().isOk())
                .andReturn();

        JsonNode booking = bodyOf(result);
        assertThat(booking.get("reference").asText()).isEqualTo(reference);
        assertThat(booking.get("guestName").asText()).isEqualTo("Meera Iyer");
        assertThat(booking.get("guestEmail").asText()).isEqualTo("meera@example.in");
        assertThat(booking.get("status").asText()).isEqualTo("CONFIRMED");
    }

    @Test
    void lookupWithWrongEmailIsIndistinguishableFromUnknownReference() throws Exception {
        MvcResult created = createBooking("Meera Iyer", "meera@example.in", soon(2), soon(4));
        String reference = bodyOf(created).get("reference").asText();

        MvcResult wrongEmail = mockMvc.perform(post("/api/bookings/lookup")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(jsonOf(Map.of("reference", reference, "guestEmail", "someone.else@example.in"))))
                .andExpect(status().isNotFound())
                .andReturn();

        // the answer must not reveal that the reference itself is real
        JsonNode body = bodyOf(wrongEmail);
        assertThat(body.get("error").asText()).isEqualTo("NOT_FOUND");
        assertThat(body.get("message").asText()).isEqualTo(GENERIC_404_MESSAGE);
        assertThat(body.get("path").asText()).isEqualTo("/api/bookings/lookup");
    }

    @Test
    void lookupMatchesTheEmailCaseInsensitively() throws Exception {
        MvcResult created = createBooking("Meera Iyer", "meera@example.in", soon(2), soon(4));
        String reference = bodyOf(created).get("reference").asText();

        mockMvc.perform(post("/api/bookings/lookup")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(jsonOf(Map.of("reference", reference, "guestEmail", "MEERA@Example.in"))))
                .andExpect(status().isOk());
    }

    @Test
    void lookupWithoutEmailIsAValidationError() throws Exception {
        MvcResult result = mockMvc.perform(post("/api/bookings/lookup")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(jsonOf(Map.of("reference", "HB-B9TF3FHA9"))))
                .andExpect(status().isBadRequest())
                .andReturn();

        JsonNode body = bodyOf(result);
        assertThat(body.get("error").asText()).isEqualTo("VALIDATION_ERROR");
        assertThat(body.get("message").asText()).contains("guestEmail");
    }

    @Test
    void unknownReferenceGetsTheGenericNotFound() throws Exception {
        MvcResult result = mockMvc.perform(post("/api/bookings/lookup")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(jsonOf(Map.of("reference", "HB-ZZZZZZZZZ", "guestEmail", "meera@example.in"))))
                .andExpect(status().isNotFound())
                .andReturn();

        JsonNode body = bodyOf(result);
        assertThat(body.get("error").asText()).isEqualTo("NOT_FOUND");
        assertThat(body.get("message").asText()).isEqualTo(GENERIC_404_MESSAGE);
        assertThat(body.get("path").asText()).isEqualTo("/api/bookings/lookup");
    }

    @Test
    void unreadableRequestBodyIsAValidationError() throws Exception {
        MvcResult result = mockMvc.perform(post("/api/bookings")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{oops"))
                .andExpect(status().isBadRequest())
                .andReturn();

        JsonNode body = bodyOf(result);
        assertThat(body.get("error").asText()).isEqualTo("VALIDATION_ERROR");
        assertThat(body.get("message").asText()).isEqualTo("Malformed or unreadable request body.");
    }

    @Test
    void missingGuestNameIsAValidationError() throws Exception {
        MvcResult result = mockMvc.perform(post("/api/bookings")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(jsonOf(Map.of(
                                "roomTypeId", 1,
                                "guestEmail", "meera@example.in",
                                "checkIn", soon(1).toString(),
                                "checkOut", soon(3).toString()))))
                .andExpect(status().isBadRequest())
                .andReturn();

        JsonNode body = bodyOf(result);
        assertThat(body.get("error").asText()).isEqualTo("VALIDATION_ERROR");
        assertThat(body.get("message").asText()).contains("guestName");
    }

    @Test
    void malformedEmailIsAValidationError() throws Exception {
        MvcResult result = createBooking("Meera Iyer", "not-an-email", soon(1), soon(3));
        assertThat(result.getResponse().getStatus()).isEqualTo(400);

        JsonNode body = bodyOf(result);
        assertThat(body.get("error").asText()).isEqualTo("VALIDATION_ERROR");
        assertThat(body.get("message").asText()).contains("guestEmail");
    }

    @Test
    void pastCheckInIsRejected() throws Exception {
        MvcResult result = createBooking("Meera Iyer", "meera@example.in",
                soon(-1), soon(3));
        assertThat(result.getResponse().getStatus()).isEqualTo(400);

        JsonNode body = bodyOf(result);
        assertThat(body.get("error").asText()).isEqualTo("VALIDATION_ERROR");
        assertThat(body.get("message").asText()).isEqualTo("checkIn cannot be in the past.");
    }

    @Test
    void reversedDatesAreRejected() throws Exception {
        LocalDate day = soon(5);
        MvcResult result = createBooking("Meera Iyer", "meera@example.in", day, day);
        assertThat(result.getResponse().getStatus()).isEqualTo(400);

        JsonNode body = bodyOf(result);
        assertThat(body.get("error").asText()).isEqualTo("VALIDATION_ERROR");
        assertThat(body.get("message").asText()).isEqualTo("checkOut must be after checkIn.");
    }

    @Test
    void cancelMarksTheBookingTerminalAndStampsTheBusinessClock() throws Exception {
        MvcResult created = createBooking("Meera Iyer", "meera@example.in", soon(2), soon(4));
        String reference = bodyOf(created).get("reference").asText();

        MvcResult result = mockMvc.perform(post("/api/bookings/" + reference + "/cancel")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(jsonOf(Map.of("guestEmail", "meera@example.in"))))
                .andExpect(status().isOk())
                .andReturn();

        JsonNode booking = bodyOf(result);
        assertThat(booking.get("status").asText()).isEqualTo("CANCELLED");
        assertThat(booking.hasNonNull("cancelledAt")).isTrue();
        // the money fields are frozen facts, cancellation does not touch them
        assertThat(booking.get("pricePerNight").decimalValue()).isEqualByComparingTo("8500.00");
        assertThat(booking.get("totalAmount").decimalValue()).isEqualByComparingTo("17000.00");
    }

    @Test
    void cancellingTwiceIsAConflict() throws Exception {
        MvcResult created = createBooking("Meera Iyer", "meera@example.in", soon(2), soon(4));
        String reference = bodyOf(created).get("reference").asText();

        mockMvc.perform(post("/api/bookings/" + reference + "/cancel")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(jsonOf(Map.of("guestEmail", "meera@example.in"))))
                .andExpect(status().isOk());

        MvcResult second = mockMvc.perform(post("/api/bookings/" + reference + "/cancel")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(jsonOf(Map.of("guestEmail", "meera@example.in"))))
                .andExpect(status().isConflict())
                .andReturn();

        JsonNode body = bodyOf(second);
        assertThat(body.get("error").asText()).isEqualTo("BOOKING_ALREADY_CANCELLED");
        assertThat(body.get("message").asText()).isEqualTo("This booking was already cancelled.");
    }

    @Test
    void cancellingUnknownReferenceIsGenericNotFound() throws Exception {
        MvcResult result = mockMvc.perform(post("/api/bookings/HB-ZZZZZZZZ8/cancel")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(jsonOf(Map.of("guestEmail", "meera@example.in"))))
                .andExpect(status().isNotFound())
                .andReturn();

        JsonNode body = bodyOf(result);
        assertThat(body.get("error").asText()).isEqualTo("NOT_FOUND");
        assertThat(body.get("message").asText()).isEqualTo(GENERIC_404_MESSAGE);
        assertThat(body.get("path").asText()).isEqualTo("/api/bookings/HB-ZZZZZZZZ8/cancel");
    }

    @Test
    void cancelWithWrongEmailLeavesTheBookingAlive() throws Exception {
        MvcResult created = createBooking("Meera Iyer", "meera@example.in", soon(2), soon(4));
        String reference = bodyOf(created).get("reference").asText();

        MvcResult rejected = mockMvc.perform(post("/api/bookings/" + reference + "/cancel")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(jsonOf(Map.of("guestEmail", "someone.else@example.in"))))
                .andExpect(status().isNotFound())
                .andReturn();
        assertThat(bodyOf(rejected).get("error").asText()).isEqualTo("NOT_FOUND");

        // the rejected attempt must not have released the room: the real
        // guest can still cancel the very same booking afterwards
        MvcResult realCancel = mockMvc.perform(post("/api/bookings/" + reference + "/cancel")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(jsonOf(Map.of("guestEmail", "meera@example.in"))))
                .andExpect(status().isOk())
                .andReturn();
        assertThat(bodyOf(realCancel).get("status").asText()).isEqualTo("CANCELLED");
    }

    @Test
    void everyNotFoundCarriesTheIdenticalGenericBody() throws Exception {
        JsonNode unknownHotel = bodyOf(mockMvc.perform(get("/api/hotels/999"))
                .andExpect(status().isNotFound()).andReturn());
        JsonNode unknownReference = bodyOf(mockMvc.perform(post("/api/bookings/lookup")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(jsonOf(Map.of("reference", "HB-ZZZZZZZZZ", "guestEmail", "meera@example.in"))))
                .andExpect(status().isNotFound()).andReturn());
        JsonNode unknownPath = bodyOf(mockMvc.perform(get("/api/definitely-not-a-real-path"))
                .andExpect(status().isNotFound()).andReturn());

        // three different reasons to say no, one indistinguishable answer -
        // a probe cannot tell which of the three exists and which does not
        assertThat(unknownHotel.get("error").asText()).isEqualTo("NOT_FOUND");
        assertThat(unknownReference.get("error").asText()).isEqualTo("NOT_FOUND");
        assertThat(unknownPath.get("error").asText()).isEqualTo("NOT_FOUND");

        assertThat(unknownHotel.get("message").asText()).isEqualTo(GENERIC_404_MESSAGE);
        assertThat(unknownReference.get("message").asText()).isEqualTo(GENERIC_404_MESSAGE);
        assertThat(unknownPath.get("message").asText()).isEqualTo(GENERIC_404_MESSAGE);
    }

    @Test
    void errorEnvelopeCarriesExactlyTheFiveDocumentedFields() throws Exception {
        createBooking("Meera Iyer", "meera@example.in", soon(1), soon(3));
        MvcResult conflict = createBooking("Vikram Rao", "vikram@example.in", soon(1), soon(3));
        assertThat(conflict.getResponse().getStatus()).isEqualTo(409);

        JsonNode body = bodyOf(conflict);
        assertThat(body.size()).isEqualTo(5);
        assertThat(body.has("timestamp")).isTrue();
        assertThat(body.get("status").asInt()).isEqualTo(409);
        assertThat(body.get("error").asText()).isEqualTo("BOOKING_UNAVAILABLE");
        assertThat(body.get("message").asText())
                .isEqualTo("The room category is already booked for those dates.");
        assertThat(body.get("path").asText()).isEqualTo("/api/bookings");

        // the timestamp is a real ISO-8601 instant with an offset - a parse
        // failure would fail the test outright
        OffsetDateTime.parse(body.get("timestamp").asText());
    }

    @Test
    void wrongVerbOnTheBookingPathIsMethodNotAllowed() throws Exception {
        MvcResult result = mockMvc.perform(get("/api/bookings"))
                .andExpect(status().isMethodNotAllowed())
                .andReturn();

        JsonNode body = bodyOf(result);
        assertThat(body.get("error").asText()).isEqualTo("METHOD_NOT_ALLOWED");
        assertThat(body.get("path").asText()).isEqualTo("/api/bookings");
    }
}
