import { useMemo } from 'react'
import type { ReactElement } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import type { Booking } from '../api/types'
import { recallConfirmedBooking } from '../lib/confirmedBooking'
import { formatInr, formatIsoDate, nightsBetween, nightsLabel } from '../lib/format'
import './BookingConfirmationPage.css'

type ConfirmationState = {
  booking?: Booking
  /** What step 3 quoted; shown alongside the confirmed total only if they differ. */
  quotedTotal?: number | null
}

/*
 * The last page of the flow, showing exactly what the API returned when
 * the booking was created - the snapshot figures, the reference, the
 * status. The data comes from the navigation state, with sessionStorage
 * as the fallback for a refresh. If both are gone the page says so and
 * points at Manage booking; it never refetches and pretends that is the
 * original answer, and it never invents a confirmation of its own.
 */
export function BookingConfirmationPage() {
  const { reference } = useParams()
  const location = useLocation()
  const state = location.state as ConfirmationState | null

  const booking: Booking | null = useMemo(() => {
    if (state?.booking && state.booking.reference === reference) return state.booking
    if (reference) return recallConfirmedBooking(reference)
    return null
  }, [state, reference])

  if (!booking) {
    return (
      <div className="confirmation confirmation--lost container">
        <p className="eyebrow">Confirmation unavailable</p>
        <h1 className="confirmation__title">This confirmation cannot be redisplayed</h1>
        <p className="confirmation__lost-lede">
          {reference
            ? `The details of booking ${reference} were shown once, when the API created it, and are not stored anywhere this page can reach now. Your reservation itself is safe in the API.`
            : 'The details of a booking are shown once, when the API creates it. Your reservation itself is safe in the API.'}{' '}
          Use Manage booking with the reference and the guest email to retrieve it, or look for
          the confirmation email.
        </p>
        <div className="confirmation__actions">
          <Link to="/manage-booking" className="btn btn--primary">
            Manage booking
          </Link>
          <Link to="/hotels" className="btn btn--ghost">
            Back to the collection
          </Link>
        </div>
      </div>
    )
  }

  const nights = nightsBetween(booking.checkIn, booking.checkOut)
  const rateMoved =
    state?.quotedTotal !== null && state?.quotedTotal !== undefined && state.quotedTotal !== booking.totalAmount

  const statusBadge: ReactElement =
    booking.status === 'CONFIRMED' ? (
      <span className="confirmation__badge confirmation__badge--confirmed">{booking.status}</span>
    ) : booking.status === 'CANCELLED' ? (
      <span className="confirmation__badge confirmation__badge--cancelled">{booking.status}</span>
    ) : (
      <span className="confirmation__badge">{booking.status}</span>
    )

  return (
    <article className="confirmation container">
      <div className="confirmation__hero">
        <span className="confirmation__seal" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12.5 10 17.5 19 7" />
          </svg>
        </span>
        <p className="eyebrow">Booking confirmed</p>
        <h1 className="confirmation__title">Your stay is reserved</h1>
        <p className="confirmation__lede">
          The API has written this reservation against {booking.hotelName}&rsquo;s inventory.
          Keep the reference &mdash; together with the guest email it is the only key to the booking.
        </p>
        <p className="confirmation__reference-label">Booking reference</p>
        <p className="confirmation__reference">{booking.reference}</p>
        {statusBadge}
      </div>

      <div className="confirmation__card">
        <dl className="confirmation__facts">
          <div>
            <dt>Guest</dt>
            <dd>
              {booking.guestName}
              <span className="confirmation__sub">{booking.guestEmail}</span>
            </dd>
          </div>
          <div>
            <dt>Stay</dt>
            <dd>
              <Link to={`/hotels/${booking.hotelId}`} className="confirmation__stay-link">
                {booking.hotelName}
              </Link>
            </dd>
          </div>
          <div>
            <dt>Room</dt>
            <dd>{booking.roomTypeName}</dd>
          </div>
          <div>
            <dt>Check-in</dt>
            <dd>{formatIsoDate(booking.checkIn)}</dd>
          </div>
          <div>
            <dt>Check-out</dt>
            <dd>{formatIsoDate(booking.checkOut)}</dd>
          </div>
          <div>
            <dt>Nights</dt>
            <dd>{nightsLabel(nights)}</dd>
          </div>
          <div>
            <dt>Rate per night</dt>
            <dd>{formatInr(booking.pricePerNight)}</dd>
          </div>
          <div className="confirmation__facts-total">
            <dt>Confirmed total</dt>
            <dd>{formatInr(booking.totalAmount)}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>{booking.status}</dd>
          </div>
          <div>
            <dt>Booked on</dt>
            <dd>{formatIsoDate(booking.createdAt.slice(0, 10))}</dd>
          </div>
        </dl>

        {rateMoved && (
          <p className="confirmation__rate-note" role="status">
            The API&rsquo;s final revalidation confirmed {formatInr(booking.totalAmount)} &mdash;
            different from the {formatInr(state?.quotedTotal ?? 0)} quoted during checkout. The
            confirmed figure above is what the booking records.
          </p>
        )}
      </div>

      <div className="confirmation__actions">
        <Link to="/manage-booking" className="btn btn--primary">
          Manage this booking
        </Link>
        <Link
          to={`/hotels/${booking.hotelId}?checkIn=${booking.checkIn}&checkOut=${booking.checkOut}`}
          className="btn btn--ghost"
        >
          View the stay
        </Link>
        <Link to="/hotels" className="btn btn--ghost">
          Back to the collection
        </Link>
      </div>

      <p className="confirmation__footnote">
        Everything on this page is the booking record exactly as the API returned it at
        creation &mdash; rates and totals are the snapshot taken then, not today&rsquo;s list price.
      </p>
    </article>
  )
}
