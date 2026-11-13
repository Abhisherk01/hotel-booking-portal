/*
 * Formatting and business-date helpers shared by the search panel, the
 * property cards and (later) the booking flow. No dependencies - the only
 * subtle piece is "today", which must be judged on an Asia/Kolkata clock
 * because that is the clock the backend's business rules run on
 * (BusinessTimeConfig). A visitor in Tokyo picking "today" then has the
 * same answer the API will enforce.
 */

const inrFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
})

/** 8500 -> "₹8,500" */
export function formatInr(amount: number): string {
  return inrFormatter.format(amount)
}

/** Nights billed for a half-open stay [checkIn, checkOut). */
export function nightsBetween(checkIn: string, checkOut: string): number {
  const inDate = parseIsoDate(checkIn)
  const outDate = parseIsoDate(checkOut)
  if (!inDate || !outDate) return 0
  return Math.round((outDate.getTime() - inDate.getTime()) / 86_400_000)
}

/** Today's date in Asia/Kolkata as YYYY-MM-DD, matching the backend Clock. */
export function businessToday(): string {
  // en-CA formats as YYYY-MM-DD, exactly what <input type="date"> wants.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

/** "1 night" / "2 nights" */
export function nightsLabel(nights: number): string {
  return nights === 1 ? '1 night' : `${nights} nights`
}

/** "2026-11-12" -> "12 Nov"; harmless on malformed input. */
export function formatIsoDate(iso: string): string {
  const date = parseIsoDate(iso)
  if (!date) return iso
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'short',
  }).format(date)
}

/** "2026-11-12" + "2026-11-14" -> "12 – 14 Nov" (same month collapses). */
export function formatStayRange(checkIn: string, checkOut: string): string {
  const sameMonth = checkIn.slice(0, 7) === checkOut.slice(0, 7)
  if (sameMonth) {
    return `${Number(checkIn.slice(8, 10))} – ${formatIsoDate(checkOut)}`
  }
  return `${formatIsoDate(checkIn)} – ${formatIsoDate(checkOut)}`
}

function parseIsoDate(iso: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!match) return null
  const [, year, month, day] = match
  // Parsed in UTC so the date never drifts across a timezone boundary.
  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)))
}
