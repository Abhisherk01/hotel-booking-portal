package com.hotelbooking.web;

import java.io.IOException;
import java.util.Map;

import jakarta.servlet.Filter;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletRequest;
import jakarta.servlet.ServletResponse;
import jakarta.servlet.http.HttpServletResponse;

/**
 * Stamps the three baseline browser-hardening headers onto every response
 * this server writes, before anything downstream runs:
 *
 * - X-Content-Type-Options: nosniff - the browser stops second-guessing a
 *   declared content type, so no response can be reinterpreted as script
 *   or HTML by content sniffing.
 * - X-Frame-Options: DENY - no frame or iframe may embed any response,
 *   closing the clickjacking door even on JSON error bodies and the
 *   actuator endpoints.
 * - Referrer-Policy: strict-origin-when-cross-origin - cross-origin
 *   navigation leaks only the origin, never a full URL; this keeps the
 *   booking reference out of third-party logs even though the lookup
 *   flow already avoids putting references in URLs at all.
 *
 * The API serves JSON only, so this is hardening for the edges where
 * server output is least curated (the /error fallback, actuator, any
 * future template) - cheap to declare, and the browser does the rest.
 *
 * Ordering contract with the booking throttle: headers are set BEFORE
 * chain.doFilter, so a 429 written by RateLimitFilter (which never calls
 * deeper) still carries them. SecurityHeadersConfig therefore registers
 * this filter ahead of the throttle. The three values are fixed security
 * standards, not deployment-tunable policy, so unlike the rate-limit
 * budgets they live in code rather than configuration.
 */
public class SecurityHeadersFilter implements Filter {

    /** Header name -> fixed value, applied with setHeader (idempotent, no duplicates). */
    static final Map<String, String> HEADERS = Map.of(
            "X-Content-Type-Options", "nosniff",
            "X-Frame-Options", "DENY",
            "Referrer-Policy", "strict-origin-when-cross-origin");

    @Override
    public void doFilter(ServletRequest request, ServletResponse response, FilterChain chain)
            throws IOException, ServletException {
        if (response instanceof HttpServletResponse httpResponse) {
            HEADERS.forEach(httpResponse::setHeader);
        }
        chain.doFilter(request, response);
    }
}
