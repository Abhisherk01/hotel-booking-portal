package com.hotelbooking.web;

import java.io.IOException;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Drives the header filter directly - no Spring context - to pin the two
 * promises the rest of the stack leans on: every response carries exactly
 * the three hardening headers, and they are already on the response before
 * the chain runs, so a short-circuiting writer (the throttle's 429) cannot
 * produce an unstamped response. Registration itself is pinned over real
 * HTTP by the contract suite.
 */
class SecurityHeadersFilterTest {

    private final SecurityHeadersFilter target = new SecurityHeadersFilter();
    private int downstreamCalls;

    private MockHttpServletResponse run(String simulatedDownstreamStatus) throws ServletException, IOException {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/hotels");
        request.setRequestURI("/api/hotels");
        MockHttpServletResponse response = new MockHttpServletResponse();
        FilterChain chain = (req, res) -> {
            downstreamCalls++;
            if (simulatedDownstreamStatus != null) {
                res.setContentType("application/json");
                ((MockHttpServletResponse) res).setStatus(Integer.parseInt(simulatedDownstreamStatus));
                res.getWriter().write("{\"status\":" + simulatedDownstreamStatus + "}");
            }
        };
        target.doFilter(request, response, chain);
        return response;
    }

    @Test
    void everyResponseCarriesExactlyTheThreeHeaders() throws Exception {
        MockHttpServletResponse response = run(null);

        assertThat(downstreamCalls).as("the filter never blocks, it only stamps").isEqualTo(1);
        assertThat(response.getHeader("X-Content-Type-Options")).isEqualTo("nosniff");
        assertThat(response.getHeader("X-Frame-Options")).isEqualTo("DENY");
        assertThat(response.getHeader("Referrer-Policy")).isEqualTo("strict-origin-when-cross-origin");
        assertThat(response.getHeaderNames()
                .stream().filter(name -> name.startsWith("X-") || name.startsWith("Referrer-")))
                .as("no surprise extra headers beyond the three")
                // order-insensitive on purpose: Map.of iteration order is
                // unspecified and HTTP header order carries no meaning
                .containsExactlyInAnyOrder("X-Content-Type-Options", "X-Frame-Options", "Referrer-Policy");
    }

    @Test
    void headersPrecedeTheChainSoThrottledResponsesStillCarryThem() throws Exception {
        // The throttle writes its 429 without calling deeper; because the
        // headers were set before the chain, the short-circuited response
        // is stamped all the same.
        MockHttpServletResponse response = run("429");

        assertThat(response.getStatus()).isEqualTo(429);
        assertThat(response.getHeader("X-Content-Type-Options")).isEqualTo("nosniff");
        assertThat(response.getHeader("X-Frame-Options")).isEqualTo("DENY");
        assertThat(response.getHeader("Referrer-Policy")).isEqualTo("strict-origin-when-cross-origin");
    }
}
