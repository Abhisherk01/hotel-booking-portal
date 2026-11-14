import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ApiError, cancelBooking, lookupBooking } from '../api/client'
import type { Booking } from '../api/types'
import { Notice } from '../components/common/Notice'
import { rememberConfirmedBooking } from '../lib/confirmedBooking'
import { formatInr, formatIsoDate, formatStayRange, nightsBetween, nightsLabel } from '../lib/format'
import './ManageBookingPage.css'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** The booking_reference column's ceiling - the same bound the API enforces. */
const REFERENCE_MAX_LENGTH = 12

type LookupErrors = { reference?: string; email?: string }

type LookupPhase =
  | { phase: 'form' }
  | { phase: 'searching' }
  | { phase: 'found'; booking: Booking }
  | { phase: 'missing' }
  | { phase: 'failed'; message: string }

type Banner = { tone: 'success' | 'info'; text: string } | null

/** What the confirmation page hands over through router state - never through the URL. */
type HandoffState = { reference?: string; guestEmail?: string }

function validateLookup(reference: string, email: string): LookupErrors {
  const errors: LookupErrors = {}
  const trimmedReference = reference.trim()
  if (!trimmedReference) {
    errors.reference = 'Enter your booking reference.'
  } else if (trimmedReference.length > REFERENCE_MAX_LENGTH) {
    errors.reference = 'Booking references are 12 characters, like HB-B9TF3FHA9.'
  }
  const trimmedEmail = email.trim()
  if (!trimmedEmail) {
    errors.email = 'Enter the email address the booking was made with.'
  } else if (trimmedEmail.length > 160) {
    errors.email = 'Keep the email under 160 characters.'
  } else if (!EMAIL_PATTERN.test(trimmedEmail)) {
    errors.email = 'Enter a valid email address, like name@example.com.'
  }
  return errors
}

/*
 * The working sibling of the confirmation page: one lookup form, one
 * ledger, one sober danger zone. Every figure on this page is the API's
 * answer to "reference + guest email", and every state change runs through
 * the API too - the frontend validates keystrokes, the backend decides
 * everything else. A mismatched pair gets the same neutral not-found the
 * API gives everyone: this page never guesses which half was wrong, and
 * its copy says so.
 */
export function ManageBookingPage() {
  const [phase, setPhase] = useState<LookupPhase>({ phase: 'form' })
  const [reference, setReference] = useState('')
  const [guestEmail, setGuestEmail] = useState('')
  const [errors, setErrors] = useState<LookupErrors>({})
  const [banner, setBanner] = useState<Banner>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [cancelError, setCancelError] = useState<string | null>(null)

  const referenceRef = useRef<HTMLInputElement>(null)
  const emailRef = useRef<HTMLInputElement>(null)
  const resultsRef = useRef<HTMLHeadingElement>(null)
  const noticeRef = useRef<HTMLDivElement>(null)
  const bannerRef = useRef<HTMLParagraphElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const keepRef = useRef<HTMLButtonElement>(null)
  // the in-flight guard the button's disabled state alone cannot give:
  // state flips render asynchronously, a ref decides synchronously
  const cancellingRef = useRef(false)
  const handoffUsed = useRef(false)

  const location = useLocation()
  const handoff = (location.state ?? null) as HandoffState | null

  async function runLookup(referenceValue: string, emailValue: string, note?: Banner): Promise<void> {
    setBanner(note ?? null)
    setCancelError(null)
    setPhase({ phase: 'searching' })
    try {
      const booking = await lookupBooking({
        reference: referenceValue.trim(),
        guestEmail: emailValue.trim(),
      })
      setPhase({ phase: 'found', booking })
      requestAnimationFrame(() => resultsRef.current?.focus())
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        setPhase({ phase: 'missing' })
      } else {
        setPhase({
          phase: 'failed',
          message:
            error instanceof ApiError
              ? error.message
              : 'The lookup did not go through. The booking, if there is one, is unchanged.',
        })
      }
      requestAnimationFrame(() => noticeRef.current?.focus())
    }
  }

  // Arriving from a fresh confirmation, the page already holds the pair -
  // one quiet lookup so the guest lands on their record, not on a form
  // they just filled out one screen ago. Once per mount, and never from
  // the URL: the email rides in router state or not at all.
  useEffect(() => {
    if (handoffUsed.current) return
    if (!handoff?.reference || !handoff?.guestEmail) return
    handoffUsed.current = true
    setReference(handoff.reference)
    setGuestEmail(handoff.guestEmail)
    void runLookup(handoff.reference, handoff.guestEmail)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (phase.phase === 'searching') return
    const found = validateLookup(reference, guestEmail)
    setErrors(found)
    if (found.reference) {
      referenceRef.current?.focus()
      return
    }
    if (found.email) {
      emailRef.current?.focus()
      return
    }
    void runLookup(reference, guestEmail)
  }

  function resetLookup() {
    setBanner(null)
    setErrors({})
    setPhase({ phase: 'form' })
    requestAnimationFrame(() => referenceRef.current?.focus())
  }

  function openCancelDialog() {
    setCancelError(null)
    setDialogOpen(true)
  }

  function closeCancelDialog() {
    // reads the ref, not the state, so an Escape pressed while a cancel is
    // in flight cannot close the dialog out from under the request
    if (cancellingRef.current) return
    setDialogOpen(false)
  }

  async function confirmCancel() {
    if (cancellingRef.current || phase.phase !== 'found') return
    const booking = phase.booking
    cancellingRef.current = true
    setCancelling(true)
    setCancelError(null)
    try {
      const cancelled = await cancelBooking(booking.reference, { guestEmail: booking.guestEmail })
      setDialogOpen(false)
      setPhase({ phase: 'found', booking: cancelled })
      // the confirmation page's cached snapshot must not keep claiming
      // CONFIRMED after the API has said CANCELLED
      rememberConfirmedBooking(cancelled)
      setBanner({
        tone: 'success',
        text: `Booking ${cancelled.reference} is cancelled. The room has been released back into inventory.`,
      })
      requestAnimationFrame(() => bannerRef.current?.focus())
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        // someone cancelled first - another tab, or a double-click that
        // slipped past the guard. Show the record as the API holds it now.
        setDialogOpen(false)
        await runLookup(booking.reference, booking.guestEmail, {
          tone: 'info',
          text: 'This booking was already cancelled. Below is the record exactly as the API stores it.',
        })
      } else if (error instanceof ApiError && error.status === 404) {
        setCancelError(
          'The API could not match this booking to that guest email. Close the dialog and check the details.',
        )
      } else {
        setCancelError(
          error instanceof ApiError
            ? error.message
            : 'The cancellation did not go through. The booking is unchanged.',
        )
      }
    } finally {
      cancellingRef.current = false
      setCancelling(false)
    }
  }

  // Dialog plumbing, same arrangement as the compare modal: focus moves in,
  // Tab stays inside, Escape answers to the ref-guarded close, and the
  // opener gets focus back when the sheet leaves.
  useEffect(() => {
    if (!dialogOpen) return
    const opener = document.activeElement as HTMLElement | null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    keepRef.current?.focus()

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        closeCancelDialog()
        return
      }
      if (event.key !== 'Tab' || !dialogRef.current) return
      const focusables = dialogRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])',
      )
      if (focusables.length === 0) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow
      opener?.focus()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialogOpen])

  const searching = phase.phase === 'searching'

  return (
    <div className="manage container">
      <header className="manage__head">
        <p className="eyebrow">Guest services</p>
        <h1 className="manage__title">Manage your booking</h1>
        <p className="manage__lede">
          Retrieve a reservation with its booking reference and the guest email it was made with.
          Both are required &mdash; the reference alone never opens a booking, and a pair that does
          not match the record gets one neutral answer, never a hint about which half was wrong.
        </p>
      </header>

      {(phase.phase === 'missing' || phase.phase === 'failed') && (
        <div ref={noticeRef} tabIndex={-1} className="manage__notice">
          {phase.phase === 'missing' ? (
            <Notice title="No booking found">
              <p>
                No reservation matches that reference and email pair. Check both against your
                confirmation &mdash; a reference looks like HB-B9TF3FHA9 &mdash; and try again.
                The API cannot say whether the reference or the email was the wrong half, and
                neither will this page.
              </p>
            </Notice>
          ) : (
            <Notice
              title="The lookup did not go through"
              action={
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => void runLookup(reference, guestEmail)}
                >
                  Try again
                </button>
              }
            >
              <p>{phase.message}</p>
            </Notice>
          )}
        </div>
      )}

      {/*
       * The form stays up through the not-found and failed states too: a
       * guest who mistyped one half must be able to correct it in place,
       * not hunt for a form that vanished with the answer.
       */}
      {(phase.phase === 'form' || phase.phase === 'missing' || phase.phase === 'failed' || searching) && (
        <section className={`manage__panel${phase.phase === 'missing' || phase.phase === 'failed' ? ' manage__panel--after-notice' : ''}`} aria-label="Find a booking">
          <form className="manage__form" noValidate onSubmit={handleSubmit} aria-busy={searching}>
            <div className="manage__field">
              <label htmlFor="manage-reference">Booking reference</label>
              <input
                id="manage-reference"
                ref={referenceRef}
                type="text"
                inputMode="text"
                autoComplete="off"
                spellCheck={false}
                placeholder="HB-B9TF3FHA9"
                value={reference}
                aria-invalid={errors.reference ? true : undefined}
                aria-describedby={errors.reference ? 'manage-reference-error' : undefined}
                disabled={searching}
                onChange={(event) => {
                  setReference(event.target.value)
                  if (errors.reference) setErrors((prev) => ({ ...prev, reference: undefined }))
                }}
              />
              {errors.reference && (
                <p className="manage__field-error" id="manage-reference-error" role="alert">
                  {errors.reference}
                </p>
              )}
            </div>

            <div className="manage__field">
              <label htmlFor="manage-email">Guest email</label>
              <input
                id="manage-email"
                ref={emailRef}
                type="email"
                autoComplete="email"
                placeholder="name@example.com"
                value={guestEmail}
                aria-invalid={errors.email ? true : undefined}
                aria-describedby={errors.email ? 'manage-email-error' : undefined}
                disabled={searching}
                onChange={(event) => {
                  setGuestEmail(event.target.value)
                  if (errors.email) setErrors((prev) => ({ ...prev, email: undefined }))
                }}
              />
              {errors.email && (
                <p className="manage__field-error" id="manage-email-error" role="alert">
                  {errors.email}
                </p>
              )}
            </div>

            <button type="submit" className="btn btn--primary manage__submit" disabled={searching}>
              {searching ? 'Searching…' : 'Find booking'}
            </button>
            <p className="manage__form-note">
              Only the pair opens a booking. If either half is wrong, the API answers the same
              neutral not-found &mdash; to this page and to everyone else.
            </p>
          </form>
        </section>
      )}

      {searching && (
        <div className="manage__skeleton" aria-hidden="true">
          <span className="manage__skeleton-line manage__skeleton-line--wide" />
          <span className="manage__skeleton-line" />
          <span className="manage__skeleton-line manage__skeleton-line--short" />
        </div>
      )}

      {phase.phase === 'found' && (
        <article className="manage__result">
          {banner && (
            <p
              ref={bannerRef}
              tabIndex={-1}
              role="status"
              className={`manage__banner manage__banner--${banner.tone}`}
            >
              {banner.text}
            </p>
          )}

          <section className="manage__ledger">
            <header className="manage__ledger-head">
              <div>
                <p className="eyebrow">Booking record</p>
                <h2 ref={resultsRef} tabIndex={-1} className="manage__reference">
                  {phase.booking.reference}
                </h2>
              </div>
              <span
                className={`manage__badge manage__badge--${phase.booking.status.toLowerCase()}`}
              >
                {phase.booking.status === 'CONFIRMED'
                  ? 'Confirmed'
                  : phase.booking.status === 'CANCELLED'
                    ? 'Cancelled'
                    : phase.booking.status}
              </span>
            </header>

            <dl className="manage__facts">
              <div>
                <dt>Guest</dt>
                <dd>
                  {phase.booking.guestName}
                  <span className="manage__sub">{phase.booking.guestEmail}</span>
                </dd>
              </div>
              <div>
                <dt>Stay</dt>
                <dd>
                  <Link to={`/hotels/${phase.booking.hotelId}`} className="manage__stay-link">
                    {phase.booking.hotelName}
                  </Link>
                </dd>
              </div>
              <div>
                <dt>Room</dt>
                <dd>{phase.booking.roomTypeName}</dd>
              </div>
              <div>
                <dt>Check-in</dt>
                <dd>{formatIsoDate(phase.booking.checkIn)}</dd>
              </div>
              <div>
                <dt>Check-out</dt>
                <dd>{formatIsoDate(phase.booking.checkOut)}</dd>
              </div>
              <div>
                <dt>Nights</dt>
                <dd>{nightsLabel(nightsBetween(phase.booking.checkIn, phase.booking.checkOut))}</dd>
              </div>
              <div>
                <dt>Rate per night</dt>
                <dd>{formatInr(phase.booking.pricePerNight)}</dd>
              </div>
              <div className="manage__facts-total">
                <dt>Total for the stay</dt>
                <dd>{formatInr(phase.booking.totalAmount)}</dd>
              </div>
              <div>
                <dt>Booked on</dt>
                <dd>{formatIsoDate(phase.booking.createdAt.slice(0, 10))}</dd>
              </div>
              {phase.booking.status === 'CANCELLED' && phase.booking.cancelledAt && (
                <div>
                  <dt>Cancelled on</dt>
                  <dd>{formatIsoDate(phase.booking.cancelledAt.slice(0, 10))}</dd>
                </div>
              )}
            </dl>

            <p className="manage__figures-note">
              Rates and totals are the snapshot the API took when the booking was created &mdash;
              the figures the guest agreed to, not today&rsquo;s list price.
            </p>
          </section>

          {phase.booking.status === 'CONFIRMED' ? (
            <section className="manage__danger" aria-label="Cancellation">
              <h3>Cancel this stay</h3>
              <p>
                Cancelling releases the room back into inventory immediately, where another guest
                can take it. The action is permanent and cannot be reversed through this
                interface &mdash; the booking keeps its reference and reads CANCELLED afterwards.
              </p>
              <button type="button" className="btn manage__danger-button" onClick={openCancelDialog}>
                Cancel this booking
              </button>
            </section>
          ) : (
            <section className="manage__terminal" aria-label="Cancellation record">
              <h3>This booking is cancelled</h3>
              <p>
                The API marked it CANCELLED
                {phase.booking.cancelledAt
                  ? ` on ${formatIsoDate(phase.booking.cancelledAt.slice(0, 10))}`
                  : ''}{' '}
                and released the room back into inventory. Nothing further can be done with it
                here.
              </p>
            </section>
          )}

          <div className="manage__result-actions">
            <button type="button" className="btn btn--ghost" onClick={resetLookup}>
              Look up another booking
            </button>
          </div>
        </article>
      )}

      {dialogOpen && phase.phase === 'found' && (
        <div className="manage-dialog" role="presentation" onClick={closeCancelDialog}>
          <div
            ref={dialogRef}
            className="manage-dialog__sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cancel-dialog-title"
            aria-describedby="cancel-dialog-summary"
            onClick={(event) => event.stopPropagation()}
          >
            <p className="eyebrow">Final step</p>
            <h2 id="cancel-dialog-title" className="manage-dialog__title">
              Cancel this booking?
            </h2>
            <p id="cancel-dialog-summary" className="manage-dialog__summary">
              {phase.booking.hotelName} &middot; {phase.booking.roomTypeName} &mdash;{' '}
              {formatStayRange(phase.booking.checkIn, phase.booking.checkOut)},{' '}
              {nightsLabel(nightsBetween(phase.booking.checkIn, phase.booking.checkOut))},{' '}
              {formatInr(phase.booking.totalAmount)}.
            </p>
            <p className="manage-dialog__warning">
              Cancelling is permanent. The API marks the booking <strong>CANCELLED</strong>{' '}
              immediately and releases the room back into inventory, where someone else can book
              it. This cannot be undone through this interface.
            </p>
            <p className="manage-dialog__note">
              The booking keeps its reference &mdash; looking it up afterwards shows CANCELLED,
              not deleted.
            </p>
            {cancelError && (
              <p className="manage-dialog__error" role="alert">
                {cancelError}
              </p>
            )}
            <div className="manage-dialog__actions">
              <button
                ref={keepRef}
                type="button"
                className="btn btn--ghost"
                onClick={closeCancelDialog}
                disabled={cancelling}
              >
                Keep booking
              </button>
              <button
                type="button"
                className="btn manage__confirm-cancel"
                onClick={() => void confirmCancel()}
                disabled={cancelling}
              >
                {cancelling ? 'Cancelling…' : 'Cancel this booking'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
