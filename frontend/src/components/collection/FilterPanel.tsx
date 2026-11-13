import type { ChangeEvent } from 'react'
import { formatInr } from '../../lib/format'
import './FilterPanel.css'

export type SortOrder = 'curated' | 'asc' | 'desc'

export interface TownOption {
  name: string
  stayCount: number
}

export interface AmenityOption {
  name: string
  count: number
}

export interface RateBounds {
  min: number
  max: number
}

type FilterPanelProps = {
  towns: TownOption[]
  /** '' means "any town" — the unfiltered collection. */
  activeTown: string
  /** False while the full list has not loaded; the chips then wait. */
  townsReady: boolean
  onTownChange: (town: string) => void

  rateBounds: RateBounds | null
  ratesLoading: boolean
  minRate: string
  maxRate: string
  onMinRateChange: (value: string) => void
  onMaxRateChange: (value: string) => void
  rateRangeInvalid: boolean

  amenities: AmenityOption[]
  selectedAmenities: string[]
  onAmenitiesChange: (next: string[]) => void
}

/*
 * The three real filters, in one quiet column:
 *   - Location runs a genuine backend search per town (or the unfiltered
 *     list for "any town").
 *   - Price reads its bounds from the rates the API actually returned,
 *     never from invented buckets.
 *   - Amenities lists only what is present in the current results, and a
 *     stay must carry every ticked amenity.
 */
export function FilterPanel({
  towns,
  activeTown,
  townsReady,
  onTownChange,
  rateBounds,
  ratesLoading,
  minRate,
  maxRate,
  onMinRateChange,
  onMaxRateChange,
  rateRangeInvalid,
  amenities,
  selectedAmenities,
  onAmenitiesChange,
}: FilterPanelProps) {
  function handleAmenityToggle(event: ChangeEvent<HTMLInputElement>) {
    const { value, checked } = event.target
    onAmenitiesChange(
      checked
        ? [...selectedAmenities, value]
        : selectedAmenities.filter((name) => name !== value),
    )
  }

  const minPlaceholder = rateBounds ? String(rateBounds.min) : '—'
  const maxPlaceholder = rateBounds ? String(rateBounds.max) : '—'
  const priceActive = minRate !== '' || maxRate !== ''
  const amenitiesActive = selectedAmenities.length > 0

  return (
    <aside className="filters" aria-label="Collection filters">
      <fieldset className="filters__group" disabled={!townsReady}>
        <legend>Location</legend>
        <div className="filters__chips" role="radiogroup" aria-label="Filter by town">
          <label className={`filters__chip ${activeTown === '' ? 'is-active' : ''}`}>
            <input
              type="radio"
              name="collection-town"
              value=""
              checked={activeTown === ''}
              onChange={() => onTownChange('')}
            />
            Any town
          </label>
          {towns.map((town) => (
            <label
              key={town.name}
              className={`filters__chip ${activeTown.toLowerCase() === town.name.toLowerCase() ? 'is-active' : ''}`}
            >
              <input
                type="radio"
                name="collection-town"
                value={town.name}
                checked={activeTown.toLowerCase() === town.name.toLowerCase()}
                onChange={() => onTownChange(town.name)}
              />
              {town.name}
              <span className="filters__chip-count">{town.stayCount}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="filters__group">
        <legend>Price per night</legend>
        {ratesLoading && rateBounds === null ? (
          <p className="filters__hint">Rates are still loading — the range applies once they land.</p>
        ) : (
          <div className="filters__price">
            <div className="filters__price-field">
              <label htmlFor="filter-min-rate">From</label>
              <input
                id="filter-min-rate"
                type="number"
                inputMode="numeric"
                min={0}
                placeholder={minPlaceholder}
                value={minRate}
                aria-invalid={rateRangeInvalid ? true : undefined}
                onChange={(event) => onMinRateChange(event.target.value)}
              />
            </div>
            <span className="filters__price-dash" aria-hidden="true">
              –
            </span>
            <div className="filters__price-field">
              <label htmlFor="filter-max-rate">To</label>
              <input
                id="filter-max-rate"
                type="number"
                inputMode="numeric"
                min={0}
                placeholder={maxPlaceholder}
                value={maxRate}
                aria-invalid={rateRangeInvalid ? true : undefined}
                onChange={(event) => onMaxRateChange(event.target.value)}
              />
            </div>
          </div>
        )}
        {rateBounds && !ratesLoading && (
          <p className="filters__hint">
            Rates in this view run {formatInr(rateBounds.min)} – {formatInr(rateBounds.max)} a
            night.
          </p>
        )}
        {rateRangeInvalid && (
          <p className="filters__error" role="alert">
            The minimum is above the maximum, so no range is applied.
          </p>
        )}
        {priceActive && (
          <button
            type="button"
            className="filters__reset"
            onClick={() => {
              onMinRateChange('')
              onMaxRateChange('')
            }}
          >
            Reset price
          </button>
        )}
      </fieldset>

      <fieldset className="filters__group">
        <legend>Amenities</legend>
        {amenities.length === 0 ? (
          <p className="filters__hint">No amenities to filter by here yet.</p>
        ) : (
          <>
            <ul className="filters__amenities">
              {amenities.map((amenity) => (
                <li key={amenity.name}>
                  <label className="filters__amenity">
                    <input
                      type="checkbox"
                      value={amenity.name}
                      checked={selectedAmenities.includes(amenity.name)}
                      onChange={handleAmenityToggle}
                    />
                    <span className="filters__amenity-name">{amenity.name}</span>
                    <span className="filters__chip-count">{amenity.count}</span>
                  </label>
                </li>
              ))}
            </ul>
            <p className="filters__hint">A stay must have every ticked amenity.</p>
          </>
        )}
        {amenitiesActive && (
          <button type="button" className="filters__reset" onClick={() => onAmenitiesChange([])}>
            Reset amenities
          </button>
        )}
      </fieldset>
    </aside>
  )
}
