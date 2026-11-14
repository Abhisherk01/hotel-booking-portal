package com.hotelbooking.web;

import java.io.IOException;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Drives the throttle directly - no Spring context, no network, no sleeps -
 * so the limit behaviour can be pinned with tiny budgets and a mutable
 * clock: admission up to the limit, the five-field 429 envelope with
 * Retry-After once over, budget restoration at the next fixed window,
 * independent per-endpoint and per-client budgets, and the kill switch for
 * gateway-fronted deployments.
 *
 * The test's mapper is built exactly like Spring Boot's (JavaTimeModule,
 * ISO timestamps) because that is the mapper production wires in; the
 * envelope assertions therefore read what a real deployment would emit.
 */
class RateLimitFilterTest {

    private static final String REMOTE = "10.0.0.1";

    private MutableClock clock;
    private ObjectMapper mapper;
    private int downstreamCalls;

    @BeforeEach
    void setUp() {
        clock = new MutableClock(Instant.parse("2026-11-14T09:00:17Z"));
        mapper = com.fasterxml.jackson.databind.json.JsonMapper.builder()
                .addModule(new JavaTimeModule())
                .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS)
                .build();
        downstreamCalls = 0;
    }

    private RateLimitFilter filter(boolean enabled, int perBucket) {
        return new RateLimitFilter(clock, mapper, enabled, 60, perBucket, perBucket, perBucket, perBucket);
    }

    private MockHttpServletResponse post(RateLimitFilter target, String path, String remoteAddr)
            throws ServletException, IOException {
        MockHttpServletRequest request = new MockHttpServletRequest("POST", path);
        request.setRequestURI(path);
        request.setRemoteAddr(remoteAddr);
        MockHttpServletResponse response = new MockHttpServletResponse();
        FilterChain chain = (req, res) -> downstreamCalls++;
        target.doFilter(request, response, chain);
        return response;
    }

    @Test
    void admitsUpToTheLimitThenAnswers429WithTheEnvelope() throws Exception {
        RateLimitFilter target = filter(true, 2);

        post(target, "/api/bookings", REMOTE);
        post(target, "/api/bookings", REMOTE);
        assertThat(downstreamCalls).as("both requests under the limit reach the chain").isEqualTo(2);

        MockHttpServletResponse third = post(target, "/api/bookings", REMOTE);

        assertThat(downstreamCalls).as("the refused request never reaches the chain").isEqualTo(2);
        assertThat(third.getStatus()).isEqualTo(429);
        int retryAfter = Integer.parseInt(third.getHeader("Retry-After"));
        assertThat(retryAfter).as("Retry-After counts down the remainder of the window")
                .isBetween(1, 60);

        JsonNode body = mapper.readTree(third.getContentAsString());
        assertThat(body.get("status").asInt()).isEqualTo(429);
        assertThat(body.get("error").asText()).isEqualTo("RATE_LIMITED");
        assertThat(body.get("message").asText()).isEqualTo(RateLimitFilter.MESSAGE);
        assertThat(body.get("path").asText()).isEqualTo("/api/bookings");
        assertThat(body.hasNonNull("timestamp")).isTrue();
    }

    @Test
    void aFreshWindowRestoresTheBudget() throws Exception {
        RateLimitFilter target = filter(true, 2);

        post(target, "/api/bookings", REMOTE);
        post(target, "/api/bookings", REMOTE);
        post(target, "/api/bookings", REMOTE);
        assertThat(downstreamCalls).isEqualTo(2);

        clock.advanceSeconds(61);

        post(target, "/api/bookings", REMOTE);
        assertThat(downstreamCalls).as("the next fixed window starts a fresh count").isEqualTo(3);
    }

    @Test
    void eachEndpointHasItsOwnBudget() throws Exception {
        RateLimitFilter target = filter(true, 2);

        post(target, "/api/bookings/lookup", REMOTE);
        post(target, "/api/bookings/lookup", REMOTE);
        MockHttpServletResponse third = post(target, "/api/bookings/lookup", REMOTE);
        assertThat(third.getStatus()).as("lookup exhausts its own budget").isEqualTo(429);
        assertThat(downstreamCalls).as("two lookups admitted, the third refused").isEqualTo(2);

        post(target, "/api/bookings", REMOTE);
        post(target, "/api/bookings/HB-B9TF3FHA9/cancel", REMOTE);
        post(target, "/api/bookings/price-quote", REMOTE);
        assertThat(downstreamCalls).as("create, cancel and quote are unaffected by lookup's budget")
                .isEqualTo(5);
    }

    @Test
    void eachClientHasItsOwnBudget() throws Exception {
        RateLimitFilter target = filter(true, 2);

        post(target, "/api/bookings", REMOTE);
        post(target, "/api/bookings", REMOTE);
        MockHttpServletResponse third = post(target, "/api/bookings", REMOTE);
        assertThat(third.getStatus()).isEqualTo(429);

        post(target, "/api/bookings", "10.0.0.2");
        assertThat(downstreamCalls).as("a different source address has its own budget").isEqualTo(3);
    }

    @Test
    void aDisabledFilterNeverBlocks() throws Exception {
        RateLimitFilter target = filter(false, 0);

        for (int i = 0; i < 5; i++) {
            post(target, "/api/bookings", REMOTE);
        }
        assertThat(downstreamCalls).as("the kill switch lets everything through, budget 0 or not")
                .isEqualTo(5);
    }

    /** Two-handed clock so window expiry is exact, never a sleep. */
    private static final class MutableClock extends Clock {

        private Instant instant;

        private MutableClock(Instant start) {
            this.instant = start;
        }

        void advanceSeconds(long seconds) {
            instant = instant.plusSeconds(seconds);
        }

        @Override
        public ZoneId getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(ZoneId zone) {
            return this;
        }

        @Override
        public Instant instant() {
            return instant;
        }
    }
}
