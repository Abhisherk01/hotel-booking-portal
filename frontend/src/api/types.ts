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
