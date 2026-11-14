package com.hotelbooking.web;

import java.io.IOException;
import java.time.Clock;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.hotelbooking.error.ApiError;

import jakarta.servlet.Filter;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletRequest;
import jakarta.servlet.ServletResponse;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;

/**
 * A single-instance, fixed-window request throttle on the four booking
 * endpoints (create, lookup, quote, cancel). Honest about what it is:
 *
 * This is DEFENSE-IN-DEPTH for a one-process deployment - a thin backstop
 * that blunts naive scripted abuse (email guessing against a known
 * reference, automated inventory exhaustion, request floods) without any
 * new dependency. It is NOT distributed protection: counters live in this
 * JVM's memory, so a second instance would keep its own budget and a
 * restart resets every window. THE PRODUCTION AUTHORITY IS THE GATEWAY -
 * an nginx/Cloudflare/load-balancer limiter in front of the API - and a
 * gateway-fronted deployment should set APP_RATE_LIMIT_ENABLED=false,
 * because then every client shares the gateway's one source address and
 * this filter would only add a single shared bucket.
 *
 * Mechanics, chosen for predictability:
 * - Fixed windows aligned to the epoch (per client+endpoint), counted
 *   atomically per key via ConcurrentHashMap.compute.
 * - The client identity is the TCP peer address (request.getRemoteAddr()),
 *   deliberately NOT the X-Forwarded-For header: headers are attacker-
 *   writable until a trusted proxy normalizes them, and trusting one
 *   silently would let a caller rotate its "identity" per request.
 * - Rejections answer the same five-field envelope as every other failure
 *   (ApiError, business-clock timestamp) with a Retry-After header, so
 *   clients branch on RATE_LIMITED like on any other code.
 * - The counter map is capped: once MAX_TRACKED_CLIENTS distinct keys are
 *   live, expired windows are swept before the next insert, so a flood of
 *   spoofed peers cannot grow the map without bound.
 */
public class RateLimitFilter implements Filter {

    public static final String ERROR_CODE = "RATE_LIMITED";
    public static final String MESSAGE = "Too many requests. Please wait a moment and try again.";

    /** Upper bound on simultaneously tracked client+endpoint keys. */
    static final int MAX_TRACKED_CLIENTS = 50_000;

    private final Clock clock;
    private final ObjectMapper mapper;
    private final boolean enabled;
    private final int windowSeconds;
    private final Map<String, Integer> limits;
    private final ConcurrentHashMap<String, Window> windows = new ConcurrentHashMap<>();

    /** Requests admitted in the fixed window starting at startEpochSecond. */
    private record Window(long startEpochSecond, int count) {
    }

    public RateLimitFilter(Clock clock, ObjectMapper mapper, boolean enabled, int windowSeconds,
                           int maxBookingCreate, int maxLookup, int maxCancel, int maxQuote) {
        this.clock = clock;
        this.mapper = mapper;
        this.enabled = enabled;
        this.windowSeconds = windowSeconds;
        this.limits = Map.of(
                "create", maxBookingCreate,
                "lookup", maxLookup,
                "cancel", maxCancel,
                "quote", maxQuote);
    }

    @Override
    public void doFilter(ServletRequest request, ServletResponse response, FilterChain chain)
            throws IOException, ServletException {
        if (!enabled || !(request instanceof HttpServletRequest httpRequest)
                || !(response instanceof HttpServletResponse httpResponse)
                || !"POST".equalsIgnoreCase(httpRequest.getMethod())) {
            chain.doFilter(request, response);
            return;
        }

        String bucket = bucketOf(httpRequest.getRequestURI());
        if (bucket == null) {
            chain.doFilter(request, response);
            return;
        }

        long windowStart = currentWindowStart();
        if (windows.size() >= MAX_TRACKED_CLIENTS) {
            windows.entrySet().removeIf(entry -> entry.getValue().startEpochSecond() != windowStart);
        }

        if (tryAcquire(clientKey(httpRequest, bucket), limits.get(bucket), windowStart)) {
            chain.doFilter(request, response);
            return;
        }
        reject(httpRequest, httpResponse, windowStart);
    }

    /** The endpoint bucket a request counts against, or null when unthrottled. */
    private String bucketOf(String path) {
        if (path.equals("/api/bookings")) {
            return "create";
        }
        if (path.equals("/api/bookings/lookup")) {
            return "lookup";
        }
        if (path.equals("/api/bookings/price-quote")) {
            return "quote";
        }
        if (path.startsWith("/api/bookings/") && path.endsWith("/cancel")) {
            return "cancel";
        }
        return null;
    }

    private String clientKey(HttpServletRequest request, String bucket) {
        return request.getRemoteAddr() + "|" + bucket;
    }

    private long currentWindowStart() {
        long now = clock.instant().getEpochSecond();
        return now / windowSeconds * windowSeconds;
    }

    /** One atomic count-or-refuse decision per client+window. */
    private boolean tryAcquire(String key, int limit, long windowStart) {
        Decision decision = new Decision();
        windows.compute(key, (ignored, existing) -> {
            if (existing == null || existing.startEpochSecond() != windowStart) {
                decision.admitted = true;
                return new Window(windowStart, 1);
            }
            if (existing.count() >= limit) {
                return existing;
            }
            decision.admitted = true;
            return new Window(windowStart, existing.count() + 1);
        });
        return decision.admitted;
    }

    private void reject(HttpServletRequest request, HttpServletResponse response, long windowStart)
            throws IOException {
        long secondsUntilReset = windowStart + windowSeconds - clock.instant().getEpochSecond();
        response.setStatus(HttpStatus.TOO_MANY_REQUESTS.value());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setCharacterEncoding("UTF-8");
        response.setHeader("Retry-After", String.valueOf(Math.max(1, secondsUntilReset)));
        ApiError body = ApiError.of(HttpStatus.TOO_MANY_REQUESTS, ERROR_CODE, MESSAGE,
                request.getRequestURI(), clock);
        mapper.writeValue(response.getWriter(), body);
    }

    /** Single-field mutable holder so a compute() lambda can report its decision. */
    private static final class Decision {
        private boolean admitted;
    }
}
