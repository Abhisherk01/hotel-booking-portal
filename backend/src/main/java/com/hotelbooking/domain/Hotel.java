package com.hotelbooking.domain;

import jakarta.persistence.CollectionTable;
import jakarta.persistence.Column;
import jakarta.persistence.ElementCollection;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.Table;

import java.util.HashSet;
import java.util.Set;

/**
 * A property listed on the portal.
 *
 * Amenities are a plain value collection backed by the hotel_amenities
 * table; the (hotel_id, amenity) pair is that table's primary key, which is
 * why no Amenity entity exists - the database itself rejects duplicates.
 */
@Entity
@Table(name = "hotels")
public class Hotel {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 160)
    private String name;

    @Column(nullable = false, length = 80)
    private String city;

    @Column(nullable = false, length = 1000)
    private String description;

    /**
     * Optional: no seed photography exists yet, so a NULL here is a normal
     * state and the client is expected to fall back to its own asset.
     */
    @Column(name = "image_url", length = 500)
    private String imageUrl;

    @ElementCollection(fetch = FetchType.LAZY)
    @CollectionTable(name = "hotel_amenities", joinColumns = @JoinColumn(name = "hotel_id"))
    @Column(name = "amenity", nullable = false, length = 80)
    private Set<String> amenities = new HashSet<>();

    protected Hotel() {
        // JPA lifecycle constructor.
    }

    public Hotel(String name, String city, String description) {
        this.name = name;
        this.city = city;
        this.description = description;
    }

    public Long getId() {
        return id;
    }

    public String getName() {
        return name;
    }

    public String getCity() {
        return city;
    }

    public String getDescription() {
        return description;
    }

    public String getImageUrl() {
        return imageUrl;
    }

    public Set<String> getAmenities() {
        return amenities;
    }
}
