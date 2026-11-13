import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { businessToday, formatStayRange, nightsBetween, nightsLabel } from '../../lib/format'
import { validateStayDates } from '../../lib/stayDates'
import './StayDatesBar.css'

type StayDatesBarProps = {
  /** Dates currently applied from the URL (empty strings when none). */
  checkIn: string
  checkOut: string
  /** True when the URL carried dates that failed validation. */
  warnInvalid: boolean
  onApply: (dates: { checkIn: string; checkOut: string }) => void
  onClear: () => void
}

/*
 * The quiet strip under the collection heading where the visitor sees and
 * changes the stay dates that came in from the homepage search. Dates are
 * optional: empty means "browse the collection without checking
 * availability". Validation mirrors the homepage panel and the backend's
 * StayDates rules, so a bad range never reaches the API.
 */
export function StayDatesBar({ checkIn, checkOut, warnInvalid, onApply, onClear }: StayDatesBarProps) {
  const [draftCheckIn, setDraftCheckIn] = useState(checkIn)
  const [draftCheckOut, setDraftCheckOut] = useState(checkOut)
  const [errors, setErrors] = useState<{ checkIn?: string; checkOut?: string }>({})

  // Someone else (the homepage, an old bookmark) owns the URL; the draft
  // follows it so the strip never shows a stale lie.
  useEffect(() => {
    setDraftCheckIn(checkIn)
    setDraftCheckOut(checkOut)
    setErrors({})
  }, [checkIn, checkOut])

  const today = useMemo(() => businessToday(), [])
  const hasDates = Boolean(checkIn && checkOut)
  const dirty = draftCheckIn !== checkIn || draftCheckOut !== checkOut

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!draftCheckIn && !draftCheckOut) {
      handleClear()
      return
    }
    if (!draftCheckIn || !draftCheckOut) {
      setErrors({ checkIn: 'Fill both dates, or clear both.' })
      return
    }
    const nextErrors = validateStayDates(draftCheckIn, draftCheckOut, today)
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return
    onApply({ checkIn: draftCheckIn, checkOut: draftCheckOut })
  }

  function handleClear() {
    setDraftCheckIn('')
    setDraftCheckOut('')
    setErrors({})
    onClear()
  }

  return (
    <div className="stay-bar">
      <form
        className="stay-bar__form"
        role="search"
        aria-label="Stay dates"
        noValidate
        onSubmit={handleSubmit}
      >
        <p className="stay-bar__label">Your dates</p>

        <div className="stay-bar__field">
          <label htmlFor="collection-check-in">Check-in</label>
          <input
            id="collection-check-in"
            type="date"
            min={today}
            value={draftCheckIn}
            aria-invalid={errors.checkIn ? true : undefined}
            onChange={(event) => setDraftCheckIn(event.target.value)}
          />
        </div>

        <div className="stay-bar__field">
          <label htmlFor="collection-check-out">Check-out</label>
          <input
            id="collection-check-out"
            type="date"
            min={draftCheckIn || today}
            value={draftCheckOut}
            aria-invalid={errors.checkOut ? true : undefined}
            onChange={(event) => setDraftCheckOut(event.target.value)}
          />
        </div>

        <button
          type="submit"
          className="btn btn--primary stay-bar__apply"
          disabled={!dirty && !errors.checkIn && !errors.checkOut}
        >
          Apply dates
        </button>

        {hasDates && (
          <button type="button" className="stay-bar__clear" onClick={handleClear}>
            Clear dates
          </button>
        )}
      </form>

      {hasDates && !dirty && (
        <p className="stay-bar__context">
          {formatStayRange(checkIn, checkOut)} · {nightsLabel(nightsBetween(checkIn, checkOut))} ·
          availability checked live against each hotel
        </p>
      )}
      {!hasDates && !warnInvalid && (
        <p className="stay-bar__context stay-bar__context--quiet">
          Browsing without dates — add them to see live availability and stay totals.
        </p>
      )}

      {warnInvalid && (
        <p className="stay-bar__warning" role="status">
          The dates carried in this link are no longer valid (in the past or reversed), so
          availability is not being checked. Pick new dates above.
        </p>
      )}

      {errors.checkIn && (
        <p className="stay-bar__warning" role="alert">
          {errors.checkIn}
        </p>
      )}
      {errors.checkOut && errors.checkOut !== errors.checkIn && (
        <p className="stay-bar__warning" role="alert">
          {errors.checkOut}
        </p>
      )}
    </div>
  )
}
