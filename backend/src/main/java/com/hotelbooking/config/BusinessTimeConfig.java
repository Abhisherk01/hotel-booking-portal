package com.hotelbooking.config;

import java.time.Clock;
import java.time.ZoneId;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class BusinessTimeConfig {

    private final ZoneId businessZone;

    public BusinessTimeConfig(@Value("${app.business-timezone}") String businessTimezone) {
        this.businessZone = ZoneId.of(businessTimezone);
    }

    // "Is this check-in in the past?" must never depend on the machine the API
    // happens to run on. Services resolve dates through this clock instead of
    // calling LocalDate.now() directly.
    @Bean
    public Clock businessClock() {
        return Clock.system(businessZone);
    }
}
