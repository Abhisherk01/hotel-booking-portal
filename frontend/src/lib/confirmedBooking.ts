/*
 * The confirmation page renders exactly what the API returned when the
 * booking was created - nothing refetched, nothing re-derived. The answer
 * lives in the router state and, so that an accidental reload does not
 * blank the page, in sessionStorage for the life of the tab.
 *
 * If both are gone (a bookmarked reference, a fresh session) the page says
 * so honestly and points at Manage booking, where lookup by reference +
 * email lives. There is deliberately no auto-refetch here pretending to be
 * the original confirmation.
 */

import type { Booking } from '../api/types'

const STORAGE_KEY = 'aurelia.confirmedBooking.v1'

export function rememberConfirmedBooking(booking: Booking): void {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(booking))
  } catch {
    // Storage unavailable (private mode); the router state still carries
    // the booking for the immediate navigation.
  }
}

export function recallConfirmedBooking(reference: string): Booking | null {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const booking = JSON.parse(raw) as Booking
    if (booking?.reference !== reference) return null
    return booking
  } catch {
    // Corrupted storage - treat as absent, the page will say so.
    return null
  }
}
