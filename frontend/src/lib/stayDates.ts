/*
 * Stay-date rules for the collection page, written to mirror two things
 * exactly: the homepage search panel and the backend's StayDates validator.
 * Check-in may not be in the past (judged on the Asia/Kolkata business
 * clock, like the API) and check-out must land after check-in.
 *
 * The collection page reads its dates from the URL, so dates that were
 * valid when the link was created can be stale by the time it is opened -
 * the helpers below let the page detect that honestly instead of sending
 * doomed requests to the availability endpoint.
 */

import { businessToday } from './format'

export interface StayDates {
  checkIn: string
  checkOut: string
}

export interface StayDatesErrors {
  checkIn?: string
  checkOut?: string
}

/** Same two rules the backend enforces, applied before a request is spent. */
export function validateStayDates(
  checkIn: string,
  checkOut: string,
  today: string = businessToday(),
): StayDatesErrors {
  const errors: StayDatesErrors = {}
  if (checkIn && checkOut) {
    if (checkIn < today) {
      errors.checkIn = 'Check-in cannot be in the past.'
    }
    if (checkOut <= checkIn) {
      errors.checkOut = 'Check-out must fall after check-in.'
    }
  }
  return errors
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/**
 * Read the stay dates carried in the listing URL.
 * - both missing            -> null (browsing without dates, perfectly normal)
 * - malformed / stale dates -> null, with hasDateParams telling the caller
 *                              that a URL *tried* to carry dates
 * - valid pair              -> the dates
 */
export function readStayDates(
  params: URLSearchParams,
  today: string = businessToday(),
): { dates: StayDates | null; hadDateParams: boolean } {
  const checkIn = params.get('checkIn') ?? ''
  const checkOut = params.get('checkOut') ?? ''
  const hadDateParams = Boolean(checkIn || checkOut)

  if (!hadDateParams) return { dates: null, hadDateParams }
  if (!ISO_DATE.test(checkIn) || !ISO_DATE.test(checkOut)) {
    return { dates: null, hadDateParams }
  }
  if (Object.keys(validateStayDates(checkIn, checkOut, today)).length > 0) {
    return { dates: null, hadDateParams }
  }
  return { dates: { checkIn, checkOut }, hadDateParams }
}
