/*
 * Shapes mirroring the Spring Boot DTOs, kept hand-written rather than
 * generated so the frontend only ever depends on the fields it actually
 * renders. Field names match the JSON exactly (camelCase from Jackson).
 */

export interface HotelSummary {
  id: number
  name: string
  city: string
  description: string
  /** NULL in the seeded database; photography backfills from the local catalog. */
  imageUrl: string | null
  amenities: string[]
}

export interface RoomTypeSummary {
  id: number
  name: string
  capacity: number
  pricePerNight: number
}

export interface HotelDetail extends HotelSummary {
  roomTypes: RoomTypeSummary[]
}

export interface RoomAvailability {
  roomTypeId: number
  name: string
  capacity: number
  pricePerNight: number
  /** Confirmed overlapping stays subtracted from capacity; 1 or 0 today. */
  availableUnits: number
  available: boolean
}

export interface HotelAvailability {
  hotelId: number
  hotelName: string
  city: string
  checkIn: string
  checkOut: string
  roomTypes: RoomAvailability[]
}

/** The body POST /api/bookings/price-quote expects. */
export interface PriceQuotePayload {
  roomTypeId: number
  checkIn: string
  checkOut: string
}

/**
 * The authoritative answer to "what would this stay cost". Produced by the
 * API without touching availability - the create call revalidates both.
 */
export interface PriceQuote {
  roomTypeId: number
  roomTypeName: string
  hotelId: number
  hotelName: string
  checkIn: string
  checkOut: string
  nights: number
  pricePerNight: number
  totalAmount: number
}

/** The body POST /api/bookings expects. */
export interface BookingPayload {
  roomTypeId: number
  guestName: string
  guestEmail: string
  checkIn: string
  checkOut: string
}

/**
 * The booking as the API stores it. pricePerNight and totalAmount are the
 * snapshot taken at creation - what the guest agreed to pay - so they are
 * the only figures a confirmation page may show.
 */
export interface Booking {
  reference: string
  hotelId: number
  hotelName: string
  roomTypeId: number
  roomTypeName: string
  guestName: string
  guestEmail: string
  checkIn: string
  checkOut: string
  /** "CONFIRMED" or "CANCELLED" today. */
  status: string
  pricePerNight: number
  totalAmount: number
  createdAt: string
  cancelledAt: string | null
}
