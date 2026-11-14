package com.hotelbooking.config;

import java.time.Clock;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.hotelbooking.web.RateLimitFilter;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Registers the booking-endpoint throttle behind the CORS filter (order 0)
 * and the security-header filter (order 1): preflight OPTIONS requests are
 * answered by CORS without spending budget, rejected requests still carry
 * CORS headers, and every throttled 429 was already stamped with the
 * security headers before it reached this filter.
 *
 * The limits are policy defaults, kept in configuration (not code) so a
 * deployment can tune them without a rebuild. The defaults are sized for a
 * single instance serving real guests: generous enough that no human flow
 * comes near them, tight enough to make scripted abuse slow and pointless.
 * This filter is a backstop for a one-process deployment; see the
 * RateLimitFilter javadoc for why the gateway remains the production
 * authority and when to set APP_RATE_LIMIT_ENABLED=false.
 */
@Configuration
public class RateLimitConfig {

    @Value("${app.rate-limit.enabled:true}")
    private boolean enabled;

    @Value("${app.rate-limit.window-seconds:60}")
    private int windowSeconds;

    @Value("${app.rate-limit.max-booking-create:10}")
    private int maxBookingCreate;

    @Value("${app.rate-limit.max-lookup:10}")
    private int maxLookup;

    @Value("${app.rate-limit.max-cancel:10}")
    private int maxCancel;

    @Value("${app.rate-limit.max-quote:30}")
    private int maxQuote;

    @Bean
    public FilterRegistrationBean<RateLimitFilter> rateLimitFilter(Clock clock, ObjectMapper mapper) {
        RateLimitFilter filter = new RateLimitFilter(clock, mapper, enabled, windowSeconds,
                maxBookingCreate, maxLookup, maxCancel, maxQuote);
        FilterRegistrationBean<RateLimitFilter> registration = new FilterRegistrationBean<>(filter);
        // Servlet patterns only support prefix/suffix wildcards, so the
        // booking subtree is registered wholesale; the filter itself routes
        // each request to its endpoint bucket (create/lookup/quote/cancel)
        // and passes anything unthrottled straight through.
        registration.addUrlPatterns("/api/bookings", "/api/bookings/*");
        registration.setOrder(2);
        registration.setName("rateLimitFilter");
        return registration;
    }
}
