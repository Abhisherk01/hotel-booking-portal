package com.hotelbooking.api;

import java.time.LocalDate;
import java.util.List;

import com.hotelbooking.dto.HotelAvailabilityDto;
import com.hotelbooking.dto.HotelDetailDto;
import com.hotelbooking.dto.HotelSummaryDto;
import com.hotelbooking.service.HotelService;

import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/hotels")
public class HotelController {

    private final HotelService hotels;

    public HotelController(HotelService hotels) {
        this.hotels = hotels;
    }

    @GetMapping
    public List<HotelSummaryDto> list() {
        return hotels.list();
    }

    @GetMapping("/search")
    public List<HotelSummaryDto> search(@RequestParam String city) {
        return hotels.search(city);
    }

    @GetMapping("/{id}")
    public HotelDetailDto detail(@PathVariable long id) {
        return hotels.detail(id);
    }

    @GetMapping("/{id}/availability")
    public HotelAvailabilityDto availability(@PathVariable long id,
                                             @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate checkIn,
                                             @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate checkOut) {
        return hotels.availability(id, checkIn, checkOut);
    }
}
