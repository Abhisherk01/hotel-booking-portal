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
  HotelAvailability,
  HotelDetail,
  HotelSummary,
} from './types'

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? ''
const REQUEST_TIMEOUT_MS = 10_000

export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

async function request<T>(path: string, searchParams?: Record<string, string>): Promise<T> {
  const url = `${API_BASE}/api${path}`
  const query = searchParams ? new URLSearchParams(searchParams).toString() : ''

  let response: Response
  try {
    response = await fetch(query ? `${url}?${query}` : url, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: { Accept: 'application/json' },
    })
  } catch {
    // Timeout or the server being unreachable - one plain sentence, the
    // browser's own cause stays in its console.
    throw new ApiError(0, 'The API did not answer. Is Spring Boot running?')
  }

  if (!response.ok) {
    const message = await errorMessageFrom(response)
    throw new ApiError(response.status, message)
  }

  return (await response.json()) as T
}

/** The backend answers failures with {timestamp, status, error, message, path}. */
async function errorMessageFrom(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { message?: string }
    if (body.message) return body.message
  } catch {
    // Non-JSON body (proxy down, HTML error page) - fall through.
  }
  return `The API answered ${response.status}.`
}

export function fetchHotels(): Promise<HotelSummary[]> {
  return request<HotelSummary[]>('/hotels')
}

export function searchHotels(city: string): Promise<HotelSummary[]> {
  return request<HotelSummary[]>('/hotels/search', { city })
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
    checkIn,
    checkOut,
  })
}
