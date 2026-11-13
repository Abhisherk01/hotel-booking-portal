package com.hotelbooking.repository;

import com.hotelbooking.domain.Hotel;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface HotelRepository extends JpaRepository<Hotel, Long> {

    /** City search for the lookup endpoint; token match, case-blind. */
    List<Hotel> findByCityContainingIgnoreCase(String city);
}
