import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ApiError, createBooking, fetchAvailability, fetchHotel, quoteBookingPrice } from '../api/client'
import type { HotelAvailability, HotelDetail, PriceQuote } from '../api/types'
import { SmartImage } from '../components/common/SmartImage'
import { Notice } from '../components/common/Notice'
import { resolveHotelCover } from '../data/imageCatalog'
import { rememberConfirmedBooking } from '../lib/confirmedBooking'
import {
  formatInr,
  formatIsoDate,
  formatStayRange,
  nightsBetween,
  nightsLabel,
} from '../lib/format'
import { readStayDates } from '../lib/stayDates'
import './BookingPage.css'

/*
 * The booking flow, in four honest steps: review what the API says you are
 * booking, say who you are, take the API's authoritative quote, and only
 * then send the booking - which the backend validates again, availability
 * included, before anything is created. The frontend computes no booking
 * figure of its own: step totals come from the availability answer, the
 * quoted total comes from price-quote, and what the confirmation page
 * shows is the snapshot the create call returns.
 */

const STEPS = [
  { key: 'stay', label: 'Review stay' },
  { key: 'guest', label: 'Guest details' },
  { key: 'price', label: 'Price confirmation' },
  { key: 'confirm', label: 'Confirm booking' },
] as const

type StepKey = (typeof STEPS)[number]['key']

type GatePhase =
  | { phase: 'loading' }
  | { phase: 'bad-params'; reason: string }
  | { phase: 'missing' }
  | { phase: 'error'; message: string }
  | { phase: 'sold-out' }
  | { phase: 'ready' }

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

interface GuestErrors {
  name?: string
  email?: string
}

function validateGuest(name: string, email: string): GuestErrors {
  const errors: GuestErrors = {}
  const trimmedName = name.trim()
  const trimmedEmail = email.trim()
  if (!trimmedName) {
    errors.name = 'Enter the guest\u2019s full name.'
  } else if (trimmedName.length > 120) {
    errors.name = 'Keep the name under 120 characters.'
  }
  if (!trimmedEmail) {
    errors.email = 'Enter an email address.'
  } else if (trimmedEmail.length > 160) {
    errors.email = 'Keep the email under 160 characters.'
  } else if (!EMAIL_PATTERN.test(trimmedEmail)) {
    errors.email = 'Enter a valid email address, like name@example.com.'
  }
  return errors
}

export function BookingPage() {
  const { hotelId } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const id = Number(hotelId)
  const idValid = Number.isInteger(id) && id > 0

  // ---- URL contract: roomTypeId + checkIn + checkOut ---------------------
  const roomTypeIdParam = Number(searchParams.get('roomTypeId'))
  const roomTypeIdValid =
    Number.isInteger(roomTypeIdParam) && roomTypeIdParam > 0 && searchParams.get('roomTypeId') !== null
  const { dates } = useMemo(() => readStayDates(searchParams), [searchParams])
  const datesValid = dates !== null

  // ---- gate: the flow cannot start without an honest set of inputs ------
  const [gate, setGate] = useState<GatePhase>({ phase: 'loading' })
  const [hotel, setHotel] = useState<HotelDetail | null>(null)
  const [stay, setStay] = useState<HotelAvailability | null>(null)
  const loadSeq = useRef(0)
  const [reloadNonce, setReloadNonce] = useState(0)

  // ---- flow state ---------------------------------------------------------
  const [step, setStep] = useState<StepKey>('stay')
  const [guestName, setGuestName] = useState('')
  const [guestEmail, setGuestEmail] = useState('')
  const [guestErrors, setGuestErrors] = useState<GuestErrors>({})
  const [quote, setQuote] = useState<PriceQuote | null>(null)
  const [quotePhase, setQuotePhase] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [quoteMessage, setQuoteMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<{ title: string; detail: string; staleDates: boolean } | null>(null)

  const submitLock = useRef(false)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const nameRef = useRef<HTMLInputElement>(null)
  const emailRef = useRef<HTMLInputElement>(null)

  // -------------------------------------------------- load hotel + stay ---
  const loadFlow = useCallback(() => {
    if (!idValid || !datesValid || !roomTypeIdValid) return
    setGate({ phase: 'loading' })
    const seq = ++loadSeq.current
    Promise.allSettled([fetchHotel(id), fetchAvailability(id, dates.checkIn, dates.checkOut)])
      .then(([hotelResult, stayResult]) => {
        if (loadSeq.current !== seq) return
        if (hotelResult.status === 'rejected') {
          const error = hotelResult.reason
          if (error instanceof ApiError && error.status === 404) {
            setGate({ phase: 'missing' })
          } else {
            setGate({
              phase: 'error',
              message: error instanceof ApiError ? error.message : 'Something went wrong.',
            })
          }
          return
        }
        setHotel(hotelResult.value)
        if (stayResult.status === 'rejected') {
          const error = stayResult.reason
          setGate({
            phase: 'error',
            message: error instanceof ApiError ? error.message : 'Something went wrong.',
          })
          return
        }
        const stayAnswer = stayResult.value
        setStay(stayAnswer)
        const room = stayAnswer.roomTypes.find((entry) => entry.roomTypeId === roomTypeIdParam)
        if (!room) {
          setGate({ phase: 'bad-params', reason: 'That room category is not offered by this stay.' })
          return
        }
        if (!room.available) {
          setGate({ phase: 'sold-out' })
          return
        }
        setGate({ phase: 'ready' })
      })
  }, [id, idValid, dates, datesValid, roomTypeIdParam, roomTypeIdValid])

  useEffect(() => {
    if (!idValid) {
      setGate({ phase: 'missing' })
      return
    }
    if (!datesValid || !roomTypeIdValid) {
      setGate({
        phase: 'bad-params',
        reason: !datesValid
          ? 'This booking flow needs valid stay dates - check-in in the future, check-out after it.'
          : 'This booking flow needs a room category. Start from the stay\u2019s rooms list.',
      })
      return
    }
    loadFlow()
  }, [idValid, datesValid, roomTypeIdValid, loadFlow, reloadNonce])

  // --------------------------------------------- step change housekeeping --
  useEffect(() => {
    window.scrollTo(0, 0)
    headingRef.current?.focus({ preventScroll: true })
  }, [step])

  // ------------------------------------------------------- price quote ----
  // Requested when the visitor reaches step 3, once per stay/room/date
  // combination. A failed quote is retryable; a rejected one (stale dates)
  // sends the visitor back to the stay page to pick new dates.
  useEffect(() => {
    if (step !== 'price' || !datesValid || gate.phase !== 'ready') return
    if (quotePhase !== 'idle') return
    setQuotePhase('loading')
    quoteBookingPrice({ roomTypeId: roomTypeIdParam, checkIn: dates.checkIn, checkOut: dates.checkOut })
      .then((answer) => {
        setQuote(answer)
        setQuotePhase('done')
      })
      .catch((error: unknown) => {
        setQuoteMessage(
          error instanceof ApiError
            ? error.message
            : 'Something went wrong while quoting the price.',
        )
        setQuotePhase('error')
      })
  }, [step, gate.phase, quotePhase, dates, datesValid, roomTypeIdParam])

  function retryQuote() {
    setQuotePhase('idle')
    setQuoteMessage('')
    setQuote(null)
  }

  // --------------------------------------------------------- navigation ---
  const stepIndex = STEPS.findIndex((entry) => entry.key === step)

  function goTo(next: StepKey) {
    setSubmitError(null)
    setStep(next)
  }

  const room = stay?.roomTypes.find((entry) => entry.roomTypeId === roomTypeIdParam)
  const nights = dates ? nightsBetween(dates.checkIn, dates.checkOut) : 0

  function submitGuest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const errors = validateGuest(guestName, guestEmail)
    setGuestErrors(errors)
    if (errors.name) {
      nameRef.current?.focus()
      return
    }
    if (errors.email) {
      emailRef.current?.focus()
      return
    }
    goTo('price')
  }

  // ------------------------------------------------------ confirm booking --
  async function confirmBooking() {
    if (submitLock.current || submitting || !datesValid || !room) return
    submitLock.current = true
    setSubmitting(true)
    setSubmitError(null)
    try {
      const booking = await createBooking({
        roomTypeId: roomTypeIdParam,
        guestName: guestName.trim(),
        guestEmail: guestEmail.trim(),
        checkIn: dates.checkIn,
        checkOut: dates.checkOut,
      })
      rememberConfirmedBooking(booking)
      navigate(`/bookings/${booking.reference}`, {
        state: { booking, quotedTotal: quote?.totalAmount ?? null },
        replace: true,
      })
      return
    } catch (error: unknown) {
      if (error instanceof ApiError) {
        if (error.code === 'BOOKING_UNAVAILABLE') {
          setSubmitError({
            title: 'The room went while you were booking',
            detail:
              `${error.message} Someone else confirmed the last unit for these dates before you did. ` +
              'Nothing was booked; the stay\u2019s current availability is one click away.',
            staleDates: false,
          })
        } else if (error.status === 400) {
          setSubmitError({
            title: 'The API could not accept these dates',
            detail: `${error.message} Pick new dates on the stay\u2019s page and start the booking again.`,
            staleDates: true,
          })
        } else {
          setSubmitError({
            title: 'The booking did not go through',
            detail: `${error.message} You can try again - no charge or booking was created.`,
            staleDates: false,
          })
        }
      } else {
        setSubmitError({
          title: 'The booking did not go through',
          detail: 'Something went wrong. You can try again - no booking was created.',
          staleDates: false,
        })
      }
    } finally {
      submitLock.current = false
      setSubmitting(false)
    }
  }

  // ------------------------------------------------------------ gates -----
  if (gate.phase === 'missing') {
    return (
      <div className="booking booking--gate container">
        <p className="eyebrow">Not part of the collection</p>
        <h1 className="booking__title" tabIndex={-1}>
          This stay does not exist
        </h1>
        <p className="booking__lede">
          The API has no property at this address, so there is nothing to book here.
        </p>
        <Link to="/hotels" className="btn btn--ghost">
          Back to the collection
        </Link>
      </div>
    )
  }

  if (gate.phase === 'bad-params') {
    return (
      <div className="booking booking--gate container">
        <p className="eyebrow">The booking cannot start yet</p>
        <h1 className="booking__title" tabIndex={-1}>
          Missing dates or room
        </h1>
        <p className="booking__lede">{gate.reason}</p>
        <Link to={idValid ? `/hotels/${id}` : '/hotels'} className="btn btn--ghost">
          {idValid ? 'Open the stay\u2019s page' : 'Back to the collection'}
        </Link>
      </div>
    )
  }

  if (gate.phase === 'error') {
    return (
      <div className="booking booking--gate container">
        <p className="eyebrow">The stay is out of reach</p>
        <h1 className="booking__title" tabIndex={-1}>
          The API did not answer
        </h1>
        <Notice
          title="Something went wrong"
          action={
            <button type="button" className="btn btn--ghost" onClick={() => setReloadNonce((n) => n + 1)}>
              Try again
            </button>
          }
        >
          <p>{gate.message} If you are running the demo locally, start Spring Boot on port 8080.</p>
        </Notice>
      </div>
    )
  }

  if (gate.phase === 'sold-out') {
    const soldOutBackTo = idValid
      ? `/hotels/${id}${dates ? `?checkIn=${dates.checkIn}&checkOut=${dates.checkOut}` : ''}`
      : '/hotels'
    return (
      <div className="booking booking--gate container">
        <p className="eyebrow">Unavailable for your dates</p>
        <h1 className="booking__title" tabIndex={-1}>
          This room category is already taken
        </h1>
        <p className="booking__lede">
          {dates
            ? `The availability API reports no free units for ${formatStayRange(dates.checkIn, dates.checkOut)}. `
              + 'Availability is checked live, so shifting your dates may open it again.'
            : 'The availability API reports no free units for the dates carried in this link.'}
        </p>
        <Link to={soldOutBackTo} className="btn btn--ghost">
          Check the stay&rsquo;s availability
        </Link>
      </div>
    )
  }

  if (gate.phase === 'loading' || !hotel || !dates || !room) {
    return (
      <div className="booking container" aria-busy="true">
        <div className="booking__skeleton-line booking__skeleton-line--eyebrow" />
        <div className="booking__skeleton-line booking__skeleton-line--title" />
        <div className="booking__skeleton-line" />
        <div className="booking__skeleton-panel" />
        <p className="booking__sr-only" role="status">
          Preparing the booking flow
        </p>
      </div>
    )
  }

  // ------------------------------------------------------------ ready -----
  const cover = resolveHotelCover(hotel.id, hotel.name, hotel.imageUrl)
  const stayTotal = room.pricePerNight * nights
  const backToStay = `/hotels/${hotel.id}?checkIn=${dates.checkIn}&checkOut=${dates.checkOut}`

  return (
    <div className="booking container">
      <Link to={backToStay} className="booking__back">
        &larr; Back to {hotel.name}
      </Link>

      <header className="booking__head">
        <p className="eyebrow">Reserve a room</p>
        <h1 className="booking__title">{hotel.name}</h1>
        <p className="booking__lede">
          {hotel.city} · {room.name} · {formatStayRange(dates.checkIn, dates.checkOut)} ·{' '}
          {nightsLabel(nights)}
        </p>
      </header>

      {/* --------------------------------------------------- step indicator */}
      <ol className="booking__steps" aria-label="Booking steps">
        {STEPS.map((entry, index) => {
          const state = index < stepIndex ? 'done' : index === stepIndex ? 'current' : 'todo'
          return (
            <li
              key={entry.key}
              className={`booking__step booking__step--${state}`}
              aria-current={state === 'current' ? 'step' : undefined}
            >
              {state === 'done' ? (
                <button type="button" className="booking__step-link" onClick={() => goTo(entry.key)}>
                  <span className="booking__step-mark" aria-hidden="true">
                    {index + 1}
                  </span>
                  {entry.label}
                </button>
              ) : (
                <span className="booking__step-link">
                  <span className="booking__step-mark" aria-hidden="true">
                    {index + 1}
                  </span>
                  {entry.label}
                </span>
              )}
            </li>
          )
        })}
      </ol>

      {/* ------------------------------------------------------- step: stay */}
      {step === 'stay' && (
        <section className="booking__panel" aria-labelledby="booking-step-title">
          <h2 id="booking-step-title" tabIndex={-1} ref={headingRef}>
            Review your stay
          </h2>
          <div className="booking__review">
            <div className="booking__review-media">
              <SmartImage src={cover.src} alt={cover.alt} />
            </div>
            <dl className="booking__facts">
              <div>
                <dt>Stay</dt>
                <dd>
                  {hotel.name}, {hotel.city}
                </dd>
              </div>
              <div>
                <dt>Room</dt>
                <dd>
                  {room.name} · Sleeps {room.capacity}
                </dd>
              </div>
              <div>
                <dt>Check-in</dt>
                <dd>{formatIsoDate(dates.checkIn)}</dd>
              </div>
              <div>
                <dt>Check-out</dt>
                <dd>{formatIsoDate(dates.checkOut)}</dd>
              </div>
              <div>
                <dt>Nights</dt>
                <dd>{nightsLabel(nights)}</dd>
              </div>
              <div>
                <dt>Nightly rate</dt>
                <dd>{formatInr(room.pricePerNight)}</dd>
              </div>
              <div className="booking__facts-total">
                <dt>Stay total</dt>
                <dd>{formatInr(stayTotal)}</dd>
              </div>
            </dl>
          </div>
          <p className="booking__note">
            These figures follow the live availability answer for your dates. The authoritative
            quote arrives in the next steps, and the API revalidates availability and price again
            the moment you confirm.
          </p>
          <div className="booking__actions">
            <Link to={backToStay} className="btn btn--ghost">
              Change dates or room
            </Link>
            <button type="button" className="btn btn--primary" onClick={() => goTo('guest')}>
              Continue to guest details
            </button>
          </div>
        </section>
      )}

      {/* ------------------------------------------------------ step: guest */}
      {step === 'guest' && (
        <section className="booking__panel" aria-labelledby="booking-step-title">
          <h2 id="booking-step-title" tabIndex={-1} ref={headingRef}>
            Guest details
          </h2>
          <form className="booking__form" noValidate onSubmit={submitGuest}>
            <p className="booking__form-lede">
              The booking is kept and retrieved with these two details &mdash; the reference alone
              never unlocks it.
            </p>

            <div className="booking__field">
              <label htmlFor="booking-name">Full name</label>
              <input
                id="booking-name"
                ref={nameRef}
                type="text"
                autoComplete="name"
                maxLength={120}
                value={guestName}
                aria-invalid={guestErrors.name ? true : undefined}
                aria-describedby={guestErrors.name ? 'booking-name-error' : undefined}
                onChange={(event) => {
                  setGuestName(event.target.value)
                  if (guestErrors.name) setGuestErrors((prev) => ({ ...prev, name: undefined }))
                }}
              />
              {guestErrors.name && (
                <p className="booking__field-error" id="booking-name-error" role="alert">
                  {guestErrors.name}
                </p>
              )}
            </div>

            <div className="booking__field">
              <label htmlFor="booking-email">Email address</label>
              <input
                id="booking-email"
                ref={emailRef}
                type="email"
                autoComplete="email"
                maxLength={160}
                value={guestEmail}
                aria-invalid={guestErrors.email ? true : undefined}
                aria-describedby={guestErrors.email ? 'booking-email-error' : undefined}
                onChange={(event) => {
                  setGuestEmail(event.target.value)
                  if (guestErrors.email) setGuestErrors((prev) => ({ ...prev, email: undefined }))
                }}
              />
              {guestErrors.email && (
                <p className="booking__field-error" id="booking-email-error" role="alert">
                  {guestErrors.email}
                </p>
              )}
            </div>

            <div className="booking__actions">
              <button type="button" className="btn btn--ghost" onClick={() => goTo('stay')}>
                Back
              </button>
              <button type="submit" className="btn btn--primary">
                Continue to price confirmation
              </button>
            </div>
          </form>
        </section>
      )}

      {/* ------------------------------------------------------ step: price */}
      {step === 'price' && (
        <section className="booking__panel" aria-labelledby="booking-step-title">
          <h2 id="booking-step-title" tabIndex={-1} ref={headingRef}>
            Price confirmation
          </h2>

          {quotePhase === 'loading' && (
            <p className="booking__note" role="status">
              Requesting the authoritative quote from the booking API…
            </p>
          )}

          {quotePhase === 'error' && (
            <Notice
              title="The quote could not be fetched"
              action={
                <button type="button" className="btn btn--ghost" onClick={retryQuote}>
                  Ask again
                </button>
              }
            >
              <p>{quoteMessage}</p>
              <p>
                If the dates have gone stale (in the past or reversed),{' '}
                <Link to={backToStay}>change them on the stay&rsquo;s page</Link>.
              </p>
            </Notice>
          )}

          {quotePhase === 'done' && quote && (
            <>
              <div className="booking__quote">
                <dl className="booking__facts booking__facts--quote">
                  <div>
                    <dt>Room</dt>
                    <dd>
                      {quote.roomTypeName} · Sleeps {room.capacity}
                    </dd>
                  </div>
                  <div>
                    <dt>Dates</dt>
                    <dd>
                      {formatStayRange(quote.checkIn, quote.checkOut)} · {nightsLabel(quote.nights)}
                    </dd>
                  </div>
                  <div>
                    <dt>Nightly rate</dt>
                    <dd>{formatInr(quote.pricePerNight)}</dd>
                  </div>
                  <div className="booking__facts-total">
                    <dt>Quoted total</dt>
                    <dd>{formatInr(quote.totalAmount)}</dd>
                  </div>
                </dl>
              </div>
              <p className="booking__note">
                This quote is the booking API&rsquo;s authoritative answer for these dates. The final
                booking request revalidates availability and the rate one last time &mdash; if the
                room was taken or the rate moved in the meantime, the API will say so before
                anything is confirmed.
              </p>
              <div className="booking__actions">
                <button type="button" className="btn btn--ghost" onClick={() => goTo('guest')}>
                  Back
                </button>
                <button type="button" className="btn btn--primary" onClick={() => goTo('confirm')}>
                  Continue to confirmation
                </button>
              </div>
            </>
          )}
        </section>
      )}

      {/* ---------------------------------------------------- step: confirm */}
      {step === 'confirm' && !quote && (
        <section className="booking__panel" aria-labelledby="booking-step-title">
          <h2 id="booking-step-title" tabIndex={-1} ref={headingRef}>
            Confirm booking
          </h2>
          <Notice
            title="The quote is missing"
            action={
              <button type="button" className="btn btn--ghost" onClick={() => goTo('price')}>
                Back to the quote
              </button>
            }
          >
            <p>The booking needs a confirmed quote before it can be sent. Go back one step and let the API answer again.</p>
          </Notice>
        </section>
      )}

      {step === 'confirm' && quote && (
        <section className="booking__panel" aria-labelledby="booking-step-title">
          <h2 id="booking-step-title" tabIndex={-1} ref={headingRef}>
            Confirm booking
          </h2>
          <dl className="booking__facts">
            <div>
              <dt>Guest</dt>
              <dd>{guestName.trim()}</dd>
            </div>
            <div>
              <dt>Email</dt>
              <dd>{guestEmail.trim()}</dd>
            </div>
            <div>
              <dt>Stay</dt>
              <dd>
                {hotel.name}, {hotel.city}
              </dd>
            </div>
            <div>
              <dt>Room</dt>
              <dd>{quote.roomTypeName}</dd>
            </div>
            <div>
              <dt>Dates</dt>
              <dd>
                {formatStayRange(dates.checkIn, dates.checkOut)} · {nightsLabel(nights)}
              </dd>
            </div>
            <div className="booking__facts-total">
              <dt>Quoted total</dt>
              <dd>{formatInr(quote.totalAmount)}</dd>
            </div>
          </dl>

          <p className="booking__note">
            Confirming sends the booking to the API, which revalidates availability and price one
            final time inside the booking transaction. If the room is gone or the rate changed,
            the booking is not created and this page will say exactly what happened.
          </p>

          {submitError && (
            <Notice title={submitError.title}>
              <p>{submitError.detail}</p>
              {submitError.staleDates ? (
                <Link to={backToStay} className="btn btn--ghost">
                  Choose new dates
                </Link>
              ) : (
                <div className="booking__error-actions">
                  <button type="button" className="btn btn--ghost" onClick={() => goTo('stay')}>
                    Review the stay
                  </button>
                  <button type="button" className="btn btn--primary" onClick={confirmBooking} disabled={submitting}>
                    Try confirming again
                  </button>
                </div>
              )}
            </Notice>
          )}

          <div className="booking__actions booking__actions--confirm">
            <button type="button" className="btn btn--ghost" onClick={() => goTo('price')} disabled={submitting}>
              Back
            </button>
            <button
              type="button"
              className="btn btn--primary booking__confirm"
              onClick={confirmBooking}
              disabled={submitting}
            >
              {submitting ? 'Confirming…' : `Confirm booking · ${formatInr(quote.totalAmount)}`}
            </button>
          </div>
        </section>
      )}
    </div>
  )
}
