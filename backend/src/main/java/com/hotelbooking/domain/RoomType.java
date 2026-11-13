package com.hotelbooking.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

import java.math.BigDecimal;

/**
 * A bookable room category.
 *
 * In this release every hotel exposes exactly one category with capacity 1,
 * so availability is a date-overlap count over bookings. capacity remains a
 * first-class column so inventory can grow later without touching the schema.
 */
@Entity
@Table(name = "room_types")
public class RoomType {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "hotel_id", nullable = false)
    private Hotel hotel;

    @Column(nullable = false, length = 120)
    private String name;

    @Column(nullable = false)
    private int capacity;

    @Column(name = "price_per_night", nullable = false, precision = 10, scale = 2)
    private BigDecimal pricePerNight;

    protected RoomType() {
        // JPA lifecycle constructor.
    }

    public RoomType(Hotel hotel, String name, int capacity, BigDecimal pricePerNight) {
        this.hotel = hotel;
        this.name = name;
        this.capacity = capacity;
        this.pricePerNight = pricePerNight;
    }

    public Long getId() {
        return id;
    }

    public Hotel getHotel() {
        return hotel;
    }

    public String getName() {
        return name;
    }

    public int getCapacity() {
        return capacity;
    }

    public BigDecimal getPricePerNight() {
        return pricePerNight;
    }
}
