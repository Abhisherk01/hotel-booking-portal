package com.hotelbooking.config;

import java.util.List;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import org.springframework.web.filter.CorsFilter;

@Configuration
public class CorsConfig {

    // Comma-separated allowlist, e.g. "http://localhost:3000,https://staging.example".
    // Unknown origins are rejected outright - no wildcard, no reflection of
    // request origins, no credentials. Browsers enforce it; the API itself
    // stays open to server-side clients (actuator checks, tests, curl).
    @Value("#{'${app.cors.allowed-origins}'.split(',')}")
    private List<String> allowedOrigins;

    @Bean
    public FilterRegistrationBean<CorsFilter> corsFilter() {
        CorsConfiguration config = new CorsConfiguration();
        config.setAllowedOrigins(allowedOrigins.stream().map(String::trim).toList());
        config.setAllowedMethods(List.of("GET", "POST", "HEAD", "OPTIONS"));
        config.setAllowedHeaders(List.of("Content-Type"));
        config.setAllowCredentials(false);
        config.setMaxAge(3600L);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/api/**", config);

        FilterRegistrationBean<CorsFilter> registration = new FilterRegistrationBean<>(new CorsFilter(source));
        registration.setOrder(0);
        return registration;
    }
}
