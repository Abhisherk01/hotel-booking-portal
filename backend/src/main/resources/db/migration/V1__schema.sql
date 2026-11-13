-- Core schema for the hotel booking portal.
--
-- One file, two engines: every statement here runs unchanged on H2 (MySQL
-- compatibility mode) and on MySQL 8.x. That constraint rules out
-- engine-specific syntax such as ENUM columns, which is why booking status
-- is a plain VARCHAR guarded by a CHECK constraint instead.

CREATE TABLE hotels (
    id          BIGINT AUTO_INCREMENT PRIMARY KEY,
    name        VARCHAR(160)  NOT NULL,
    city        VARCHAR(80)   NOT NULL,
    description VARCHAR(1000) NOT NULL,
    CONSTRAINT uq_hotels_name_city UNIQUE (name, city)
);

-- Amenities are a plain value collection: the (hotel, amenity) pair is the
-- identity, so a composite primary key replaces a surrogate id column.
CREATE TABLE hotel_amenities (
    hotel_id BIGINT      NOT NULL,
    amenity  VARCHAR(80) NOT NULL,
    PRIMARY KEY (hotel_id, amenity),
    CONSTRAINT fk_amenities_hotel
        FOREIGN KEY (hotel_id) REFERENCES hotels (id) ON DELETE CASCADE
);

-- Every hotel exposes exactly one category in this release and capacity is
-- fixed at one physical room, so availability reduces to a date-overlap
-- count over bookings. capacity stays a first-class column so inventory can
-- grow later without a schema change. Deliberately no number_of_rooms on
-- bookings: a booking occupies exactly one room of its type.
CREATE TABLE room_types (
    id              BIGINT        AUTO_INCREMENT PRIMARY KEY,
    hotel_id        BIGINT        NOT NULL,
    name            VARCHAR(120)  NOT NULL,
    capacity        INT           NOT NULL,
    price_per_night DECIMAL(10,2) NOT NULL,
    CONSTRAINT fk_room_types_hotel
        FOREIGN KEY (hotel_id) REFERENCES hotels (id),
    CONSTRAINT ck_room_types_capacity CHECK (capacity > 0),
    CONSTRAINT ck_room_types_price    CHECK (price_per_night >= 0)
);

CREATE TABLE bookings (
    id                       BIGINT        AUTO_INCREMENT PRIMARY KEY,
    booking_reference        VARCHAR(12)   NOT NULL,
    room_type_id             BIGINT        NOT NULL,
    guest_name               VARCHAR(120)  NOT NULL,
    guest_email              VARCHAR(160)  NOT NULL,
    check_in                 DATE          NOT NULL,
    check_out                DATE          NOT NULL,
    status                   VARCHAR(20)   NOT NULL,
    price_per_night_snapshot DECIMAL(10,2) NOT NULL,
    total_amount             DECIMAL(10,2) NOT NULL,
    created_at               DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    cancelled_at             DATETIME      NULL,
    CONSTRAINT uq_bookings_reference UNIQUE (booking_reference),
    CONSTRAINT fk_bookings_room_type
        FOREIGN KEY (room_type_id) REFERENCES room_types (id),
    -- Stays are half-open ranges [check_in, check_out): one guest's check-out
    -- date may be the next guest's check-in date, same-day turnover.
    CONSTRAINT ck_bookings_dates  CHECK (check_out > check_in),
    CONSTRAINT ck_bookings_status CHECK (status IN ('CONFIRMED', 'CANCELLED')),
    CONSTRAINT ck_bookings_total  CHECK (total_amount >= 0),
    -- Cancellation always records when it happened; a live booking carries
    -- no cancellation timestamp.
    CONSTRAINT ck_bookings_cancellation_state CHECK (
        (status = 'CANCELLED' AND cancelled_at IS NOT NULL)
        OR (status = 'CONFIRMED' AND cancelled_at IS NULL)
    )
);

-- Serves the availability query: for a room type and date range, count the
-- non-cancelled bookings that overlap the range.
CREATE INDEX idx_bookings_availability
    ON bookings (room_type_id, status, check_in, check_out);
