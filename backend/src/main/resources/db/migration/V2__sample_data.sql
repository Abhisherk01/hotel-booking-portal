-- Seed data: five properties across India's classic leisure circuit, priced
-- in INR. Fixed primary keys keep the cross-table references deterministic
-- and readable; Flyway runs this script once per database, so the ids are
-- stable from here on.

INSERT INTO hotels (id, name, city, description) VALUES
(1, 'Hawa Mahal Courtyard Haveli', 'Jaipur',
   'A restored 1930s haveli five minutes from the Pink City bazaars, with jali-screened verandas and a rooftop facing the Aravalli ridge.'),
(2, 'Lake Pichola Stone Villa', 'Udaipur',
   'A lakeside stone villa on the quiet bank of Pichola, a short walk from the ghats, with boat transfers arranged at the front desk.'),
(3, 'Cavelossim Palms Beach House', 'Goa',
   'A whitewashed beach house between the Cavelossim sand and the sal fields, with a shaded veranda and seafood grills most evenings.'),
(4, 'Fort Kochi Spice Residence', 'Kochi',
   'A colonial-era merchant residence in old Fort Kochi, walking distance from the Chinese fishing nets and the spice warehouses.'),
(5, 'Cedar Ridge Mountain Lodge', 'Manali',
   'A cedar-and-stone lodge on the forest edge above Old Manali, with mountain-facing balconies and a wood-fired kitchen.');

-- One category per hotel, capacity fixed at one physical room for this
-- release (see V1__schema.sql for the reasoning).
INSERT INTO room_types (id, hotel_id, name, capacity, price_per_night) VALUES
(1, 1, 'Heritage Courtyard Room',  1,  8500.00),
(2, 2, 'Lakefront Stone Room',     1, 12400.00),
(3, 3, 'Beachside Cottage',        1,  7800.00),
(4, 4, 'Colonial Veranda Room',    1,  6900.00),
(5, 5, 'Cedar View Cabin',         1,  5900.00);

INSERT INTO hotel_amenities (hotel_id, amenity) VALUES
(1, 'Rooftop Pool'),
(1, 'Breakfast Included'),
(1, 'Free Wi-Fi'),
(1, 'Air Conditioning'),
(1, 'Heritage Walk Desk'),
(1, 'Airport Pickup'),
(2, 'Lake View Terrace'),
(2, 'Boat Transfer Desk'),
(2, 'Breakfast Included'),
(2, 'Free Wi-Fi'),
(2, 'Ayurvedic Spa'),
(2, 'Evening Aarti Visit'),
(3, 'Beach Access'),
(3, 'Breakfast Included'),
(3, 'Free Wi-Fi'),
(3, 'Seafood Grill'),
(3, 'Cycle Rental'),
(3, 'Outdoor Shower'),
(4, 'Backwater Cruise Desk'),
(4, 'Kerala Breakfast'),
(4, 'Free Wi-Fi'),
(4, 'Courtyard Cafe'),
(4, 'Art Gallery Access'),
(4, 'Airport Pickup'),
(5, 'Mountain View Balcony'),
(5, 'Fireplace Lounge'),
(5, 'Breakfast Included'),
(5, 'Free Wi-Fi'),
(5, 'Heated Rooms'),
(5, 'Trekking Desk');
