package com.hotelbooking.config;

import com.hotelbooking.web.SecurityHeadersFilter;

import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Registers the security-header filter across every response, in the same
 * FilterRegistrationBean style as the CORS allowlist (order 0) and the
 * booking throttle (order 2). Order 1 puts it between the two, ahead of
 * the throttle on purpose: headers are set before the chain runs, so a
 * 429 short-circuited by the throttle is still fully stamped - one
 * invariant ("every response carries the three headers") with no
 * exceptions to document or test around.
 */
@Configuration
public class SecurityHeadersConfig {

    @Bean
    public FilterRegistrationBean<SecurityHeadersFilter> securityHeadersFilter() {
        FilterRegistrationBean<SecurityHeadersFilter> registration =
                new FilterRegistrationBean<>(new SecurityHeadersFilter());
        registration.addUrlPatterns("/*");
        registration.setOrder(1);
        registration.setName("securityHeadersFilter");
        return registration;
    }
}
