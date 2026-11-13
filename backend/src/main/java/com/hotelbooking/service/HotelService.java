package com.hotelbooking.service;

import java.time.Clock;
import java.time.LocalDate;
import java.util.List;

import com.hotelbooking.domain.BookingStatus;
import com.hotelbooking.domain.Hotel;
import com.hotelbooking.dto.HotelAvailabilityDto;
import com.hotelbooking.dto.HotelDetailDto;
import com.hotelbooking.dto.HotelSummaryDto;
import com.hotelbooking.dto.RoomAvailabilityDto;
import com.hotelbooking.dto.RoomTypeDto;
import com.hotelbooking.error.BadRequestApiException;
import com.hotelbooking.error.NotFoundApiException;
import com.hotelbooking.repository.BookingRepository;
import com.hotelbooking.repository.HotelRepository;
import com.hotelbooking.repository.RoomTypeRepository;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class HotelService {

    private final HotelRepository hotels;
    private final RoomTypeRepository roomTypes;
    private final BookingRepository bookings;
    private final Clock clock;

    public HotelService(HotelRepository hotels, RoomTypeRepository roomTypes,
                        BookingRepository bookings, Clock clock) {
        this.hotels = hotels;
        this.roomTypes = roomTypes;
        this.bookings = bookings;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public List<HotelSummaryDto> list() {
        return hotels.findAll().stream().map(HotelSummaryDto::from).toList();
    }

    @Transactional(readOnly = true)
    public HotelDetailDto detail(long id) {
        Hotel hotel = hotels.findById(id).orElseThrow(NotFoundApiException::new);
        List<RoomTypeDto> categories = roomTypes.findByHotelId(id).stream()
                .map(RoomTypeDto::from)
                .toList();
        return HotelDetailDto.from(hotel, categories);
    }

    @Transactional(readOnly = true)
    public List<HotelSummaryDto> search(String city) {
        if (city == null || city.isBlank()) {
            throw new BadRequestApiException("The 'city' parameter is required.");
        }
        return hotels.findByCityContainingIgnoreCase(city.trim()).stream()
                .map(HotelSummaryDto::from)
                .toList();
    }

    /**
     * Reads availability without locking. A quoted "available" answer can be
     * stale the moment it is sent; the decision that must not be stale is
     * made under lock in BookingService.create, which is why this endpoint
     * is a guide for the UI and never the final word.
     */
    @Transactional(readOnly = true)
    public HotelAvailabilityDto availability(long hotelId, LocalDate checkIn, LocalDate checkOut) {
        StayDates.validate(checkIn, checkOut, clock);
        Hotel hotel = hotels.findById(hotelId).orElseThrow(NotFoundApiException::new);
        List<RoomAvailabilityDto> rooms = roomTypes.findByHotelId(hotelId).stream()
                .map(roomType -> {
                    long held = bookings.countOverlappingBookings(
                            roomType.getId(), BookingStatus.CONFIRMED, checkIn, checkOut);
                    int free = (int) Math.max(0, roomType.getCapacity() - held);
                    return new RoomAvailabilityDto(roomType.getId(), roomType.getName(),
                            roomType.getCapacity(), roomType.getPricePerNight(),
                            free, free > 0);
                })
                .toList();
        return new HotelAvailabilityDto(hotel.getId(), hotel.getName(), hotel.getCity(),
                checkIn, checkOut, rooms);
    }
}
