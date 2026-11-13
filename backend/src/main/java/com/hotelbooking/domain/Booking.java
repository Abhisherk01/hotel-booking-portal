package com.hotelbooking.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import org.hibernate.annotations.CreationTimestamp;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * A reservation against one room category.
 *
 * The quote fields (price_per_night_snapshot, total_amount) are written once
 * at creation and never updated afterwards - there is no code path that
 * mutates them - so later repricing of a room type cannot rewrite what a
 * guest agreed to pay.
 */
@Entity
@Table(name = "bookings")
public class Booking {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "booking_reference", nullable = false, unique = true, length = 12)
    private String bookingReference;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "room_type_id", nullable = false)
    private RoomType roomType;

    @Column(name = "guest_name", nullable = false, length = 120)
    private String guestName;

    @Column(name = "guest_email", nullable = false, length = 160)
    private String guestEmail;

    @Column(name = "check_in", nullable = false)
    private LocalDate checkIn;

    @Column(name = "check_out", nullable = false)
    private LocalDate checkOut;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private BookingStatus status;

    @Column(name = "price_per_night_snapshot", nullable = false, precision = 10, scale = 2)
    private BigDecimal pricePerNightSnapshot;

    @Column(name = "total_amount", nullable = false, precision = 10, scale = 2)
    private BigDecimal totalAmount;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "cancelled_at")
    private LocalDateTime cancelledAt;

    protected Booking() {
        // JPA lifecycle constructor.
    }

    /**
     * New bookings always start CONFIRMED; there is no pending state because
     * a booking either holds its room or does not exist.
     */
    public Booking(RoomType roomType, String bookingReference, String guestName, String guestEmail,
                   LocalDate checkIn, LocalDate checkOut, BigDecimal pricePerNightSnapshot, BigDecimal totalAmount) {
        this.roomType = roomType;
        this.bookingReference = bookingReference;
        this.guestName = guestName;
        this.guestEmail = guestEmail;
        this.checkIn = checkIn;
        this.checkOut = checkOut;
        this.status = BookingStatus.CONFIRMED;
        this.pricePerNightSnapshot = pricePerNightSnapshot;
        this.totalAmount = totalAmount;
    }

    /**
     * Cancellation is terminal: the status and its timestamp always move
     * together, mirroring the ck_bookings_cancellation_state constraint.
     */
    public void markCancelled(LocalDateTime cancelledAt) {
        this.status = BookingStatus.CANCELLED;
        this.cancelledAt = cancelledAt;
    }

    /**
     * Lookup and cancellation pair the reference with the guest email.
     * Mailboxes are matched case-insensitively in practice - "Meera@Example.in"
     * and "meera@example.in" reach the same person - so the comparison does
     * the same rather than failing a guest who capitalized differently.
     */
    public boolean matchesGuestEmail(String candidate) {
        if (candidate == null) {
            return false;
        }
        return guestEmail.equalsIgnoreCase(candidate.trim());
    }

    public Long getId() {
        return id;
    }

    public String getBookingReference() {
        return bookingReference;
    }

    public RoomType getRoomType() {
        return roomType;
    }

    public String getGuestName() {
        return guestName;
    }

    public String getGuestEmail() {
        return guestEmail;
    }

    public LocalDate getCheckIn() {
        return checkIn;
    }

    public LocalDate getCheckOut() {
        return checkOut;
    }

    public BookingStatus getStatus() {
        return status;
    }

    public BigDecimal getPricePerNightSnapshot() {
        return pricePerNightSnapshot;
    }

    public BigDecimal getTotalAmount() {
        return totalAmount;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public LocalDateTime getCancelledAt() {
        return cancelledAt;
    }
}
