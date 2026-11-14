/*
 * The single door to the Spring Boot API. Every call funnels through
 * request() so timeouts, error envelopes and network failures are handled
 * in one place instead of being re-invented per component.
 *
 * The base URL stays relative ('/api') because Vite proxies it to Spring
 * Boot in both dev and preview. Set VITE_API_BASE_URL only when the
 * frontend is served from a different origin than the API - the backend
 * then needs that origin in CORS_ALLOWED_ORIGINS.
 */

import type {
  Booking,
  BookingCancelPayload,
  BookingLookupPayload,
  BookingPayload,
  HotelAvailability,
  HotelDetail,
  HotelSummary,
  PriceQuote,
  PriceQuotePayload,
} from './types'

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? ''
const REQUEST_TIMEOUT_MS = 10_000

export class ApiError extends Error {
  readonly status: number
  /** The stable token from the envelope's error field, e.g. BOOKING_UNAVAILABLE. */
  readonly code: string

  constructor(status: number, message: string, code = '') {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

type RequestOptions = {
  searchParams?: Record<string, string>
  /** Present means POST with a JSON body. */
  body?: unknown
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const url = `${API_BASE}/api${path}`
  const query = options.searchParams
    ? new URLSearchParams(options.searchParams).toString()
    : ''

  let response: Response
  try {
    response = await fetch(query ? `${url}?${query}` : url, {
      method: options.body === undefined ? 'GET' : 'POST',
      headers:
        options.body === undefined
          ? { Accept: 'application/json' }
          : { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
  } catch {
    // Timeout or the server being unreachable - one plain sentence, the
    // browser's own cause stays in its console.
    throw new ApiError(0, 'The API did not answer. Is Spring Boot running?')
  }

  if (!response.ok) {
    const failure = await failureFrom(response)
    throw new ApiError(response.status, failure.message, failure.code)
  }

  return (await response.json()) as T
}

/**
 * The backend answers failures with {timestamp, status, error, message,
 * path} - message is what a human reads, error is the token code the
 * frontend branches on (BOOKING_UNAVAILABLE and friends).
 */
async function failureFrom(response: Response): Promise<{ message: string; code: string }> {
  try {
    const body = (await response.json()) as { message?: string; error?: string }
    return {
      message: body.message ?? `The API answered ${response.status}.`,
      code: body.error ?? '',
    }
  } catch {
    // Non-JSON body (proxy down, HTML error page) - fall through.
    return { message: `The API answered ${response.status}.`, code: '' }
  }
}

export function fetchHotels(): Promise<HotelSummary[]> {
  return request<HotelSummary[]>('/hotels')
}

export function searchHotels(city: string): Promise<HotelSummary[]> {
  return request<HotelSummary[]>('/hotels/search', { searchParams: { city } })
}

export function fetchHotel(id: number): Promise<HotelDetail> {
  return request<HotelDetail>(`/hotels/${id}`)
}

export function fetchAvailability(
  hotelId: number,
  checkIn: string,
  checkOut: string,
): Promise<HotelAvailability> {
  return request<HotelAvailability>(`/hotels/${hotelId}/availability`, {
    searchParams: { checkIn, checkOut },
  })
}

/** The authoritative rate for a stay. Quoting never touches availability. */
export function quoteBookingPrice(payload: PriceQuotePayload): Promise<PriceQuote> {
  return request<PriceQuote>('/bookings/price-quote', { body: payload })
}

/**
 * Create the booking. The API answers 201 with the stored reservation -
 * snapshot figures included - or a deliberate failure: 409
 * BOOKING_UNAVAILABLE when another guest won the room, 400 when the dates
 * no longer pass validation. Anything confirmed happened server-side.
 */
export function createBooking(payload: BookingPayload): Promise<Booking> {
  return request<Booking>('/bookings', { body: payload })
}

/**
 * Retrieve a booking by its reference and guest email pair. The API
 * answers the same generic 404 whether the reference is unknown or the
 * email does not match, and this client deliberately passes that through
 * untouched: one neutral message, never a hint about which half was wrong.
 */
export function lookupBooking(payload: BookingLookupPayload): Promise<Booking> {
  return request<Booking>('/bookings/lookup', { body: payload })
}

/**
 * Cancel a booking. 200 returns the CANCELLED record; 409
 * BOOKING_ALREADY_CANCELLED means the booking reached its terminal state
 * earlier (possibly from another tab); a wrong email is the same generic
 * 404 as an unknown reference. The backend re-verifies the email pair and
 * the status under a row lock - the frontend only asks, it never decides.
 */
export function cancelBooking(reference: string, payload: BookingCancelPayload): Promise<Booking> {
  return request<Booking>(`/bookings/${encodeURIComponent(reference)}/cancel`, { body: payload })
}
