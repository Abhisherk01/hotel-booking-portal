import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { businessToday } from '../../lib/format'
import './SearchPanel.css'

export interface StayQuery {
  city: string
  checkIn: string
  checkOut: string
}

type SearchPanelProps = {
  /** Towns with at least one property, straight from the API. */
  cities: string[]
  citiesLoading: boolean
  busy: boolean
  value: StayQuery
  onChange: (next: StayQuery) => void
  onSubmit: (query: StayQuery) => void
}

type FieldErrors = Partial<Record<'destination' | 'checkIn' | 'checkOut', string>>

/*
 * The same rules the backend enforces in StayDates, applied early so the
 * visitor learns about a bad range before a request is spent: check-in
 * may not be past (judged on the Asia/Kolkata business clock, like the
 * API) and check-out must land after check-in. Dates are optional - the
 * panel searches by town alone when they are left empty.
 */
function validate(query: StayQuery, today: string): FieldErrors {
  const errors: FieldErrors = {}

  if (!query.city) {
    errors.destination = 'Choose a town to search.'
  }

  if ((query.checkIn && !query.checkOut) || (!query.checkIn && query.checkOut)) {
    errors.checkIn = 'Fill both dates, or leave both empty.'
    errors.checkOut = errors.checkIn
  }

  if (query.checkIn && query.checkOut) {
    if (query.checkIn < today) {
      errors.checkIn = 'Check-in cannot be in the past.'
    }
    if (query.checkOut <= query.checkIn) {
      errors.checkOut = 'Check-out must fall after check-in.'
    }
  }

  return errors
}

export function SearchPanel({ cities, citiesLoading, busy, value, onChange, onSubmit }: SearchPanelProps) {
  const [errors, setErrors] = useState<FieldErrors>({})
  const today = businessToday()

  const errorList = useMemo(
    () => Object.values(errors).filter((message, index, all) => message && all.indexOf(message) === index),
    [errors],
  )
  const hasErrors = errorList.length > 0
  const describedBy = hasErrors ? 'search-errors' : undefined

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const nextErrors = validate(value, today)
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) {
      // Walk the visitor to the first field that needs attention - on a
      // phone the error strip can otherwise sit below the fold.
      const firstInvalid = (['destination', 'checkIn', 'checkOut'] as const).find(
        (field) => nextErrors[field],
      )
      if (firstInvalid) {
        const fieldIds = {
          destination: 'search-destination',
          checkIn: 'search-check-in',
          checkOut: 'search-check-out',
        } as const
        event.currentTarget
          .querySelector<HTMLSelectElement | HTMLInputElement>(`#${fieldIds[firstInvalid]}`)
          ?.focus()
      }
      return
    }
    onSubmit(value)
  }

  return (
    <form
      className="search-panel"
      role="search"
      aria-label="Stay search"
      aria-busy={busy}
      noValidate
      onSubmit={handleSubmit}
    >
      <div className="search-panel__field search-panel__field--destination">
        <label htmlFor="search-destination">Destination</label>
        <select
          id="search-destination"
          required
          value={value.city}
          aria-invalid={errors.destination ? true : undefined}
          aria-describedby={describedBy}
          onChange={(event) => onChange({ ...value, city: event.target.value })}
        >
          <option value="" disabled>
            {citiesLoading ? 'Loading towns…' : 'Choose a town'}
          </option>
          {cities.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </div>

      <div className="search-panel__field">
        <label htmlFor="search-check-in">Check-in</label>
        <input
          id="search-check-in"
          type="date"
          min={today}
          value={value.checkIn}
          aria-invalid={errors.checkIn ? true : undefined}
          aria-describedby={describedBy}
          onChange={(event) => onChange({ ...value, checkIn: event.target.value })}
        />
      </div>

      <div className="search-panel__field">
        <label htmlFor="search-check-out">Check-out</label>
        <input
          id="search-check-out"
          type="date"
          min={value.checkIn || today}
          value={value.checkOut}
          aria-invalid={errors.checkOut ? true : undefined}
          aria-describedby={describedBy}
          onChange={(event) => onChange({ ...value, checkOut: event.target.value })}
        />
      </div>

      <button type="submit" className="btn btn--primary search-panel__submit" disabled={busy}>
        {busy ? 'Searching…' : 'Search availability'}
      </button>

      {hasErrors && (
        <p className="search-panel__errors" id="search-errors" role="alert">
          {errorList.map((message) => (
            <span key={message}>{message}</span>
          ))}
        </p>
      )}
    </form>
  )
}
