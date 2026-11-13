import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ApiError, fetchAvailability, fetchHotel, fetchHotels, searchHotels } from '../api/client'
import type { HotelAvailability, HotelDetail, HotelSummary } from '../api/types'
import { HotelCard } from '../components/home/HotelCard'
import { SkeletonCard } from '../components/common/SkeletonCard'
import { Notice } from '../components/common/Notice'
import { StayDatesBar } from '../components/collection/StayDatesBar'
import { FilterPanel, type AmenityOption, type RateBounds, type SortOrder, type TownOption } from '../components/collection/FilterPanel'
import { CompareTray } from '../components/collection/CompareTray'
import { CompareModal } from '../components/collection/CompareModal'
import { formatStayRange, nightsBetween, nightsLabel } from '../lib/format'
import { readStayDates } from '../lib/stayDates'
import './CollectionPage.css'

/*
 * The collection listing: every stay the API knows about, filtered and
 * sorted in the browser but never faked. The destination and the dates
 * live in the URL (they arrived from the homepage search and they must
 * survive filter and sort changes), while price, amenity and sort choices
 * are plain component state.
 */

const COMPARE_LIMIT = 3
const COMPARE_STORAGE_KEY = 'aurelia.compare.v1'

/** Cheapest room rate per hotel. undefined = still loading, null = failed. */
type RateMap = Record<number, number | null | undefined>

/** Per-hotel availability answers. Same convention as the homepage. */
type StayMap = Record<number, HotelAvailability | null | undefined>

type ResultsPhase =
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  | { phase: 'done'; hotels: HotelSummary[] }

function readStoredCompareIds(): number[] {
  try {
    const stored: unknown = JSON.parse(window.localStorage.getItem(COMPARE_STORAGE_KEY) ?? '[]')
    if (!Array.isArray(stored)) return []
    return stored.filter((value): value is number => Number.isInteger(value)).slice(0, COMPARE_LIMIT)
  } catch {
    // Corrupted storage or a privacy mode that blocks it - start fresh.
    return []
  }
}

function parseRateInput(raw: string): number | null {
  if (raw.trim() === '') return null
  const value = Number(raw)
  if (!Number.isFinite(value) || value < 0) return null
  return value
}

export function CollectionPage() {
  const [searchParams, setSearchParams] = useSearchParams()

  // ---- search parameters (URL is the single source of truth) -----------
  const destinationParam = (searchParams.get('destination') ?? '').trim()
  const { dates, hadDateParams } = useMemo(
    () => readStayDates(searchParams),
    // searchParams is a fresh object on every navigation; parsing is cheap.
    [searchParams],
  )

  // ---- server data ------------------------------------------------------
  const [results, setResults] = useState<ResultsPhase>({ phase: 'loading' })
  const [towns, setTowns] = useState<HotelSummary[] | null>(null)
  const [rates, setRates] = useState<RateMap>({})
  const [stays, setStays] = useState<StayMap>({})

  // ---- visitor choices ---------------------------------------------------
  const [minRate, setMinRate] = useState('')
  const [maxRate, setMaxRate] = useState('')
  const [selectedAmenities, setSelectedAmenities] = useState<string[]>([])
  const [sort, setSort] = useState<SortOrder>('curated')
  const [filtersOpen, setFiltersOpen] = useState(false)

  // ---- comparison --------------------------------------------------------
  const [compareIds, setCompareIds] = useState<number[]>(readStoredCompareIds)
  const [compareSummaries, setCompareSummaries] = useState<Record<number, HotelSummary>>({})
  const [compareDetails, setCompareDetails] = useState<Record<number, HotelDetail | null>>({})
  const [compareOpen, setCompareOpen] = useState(false)

  const resultsSeq = useRef(0)
  const staysSeq = useRef(0)

  // ----------------------------------------------------------- results ---
  const loadResults = useCallback(() => {
    const seq = ++resultsSeq.current
    setRates({})
    setStays({})
    setResults({ phase: 'loading' })

    const request = destinationParam ? searchHotels(destinationParam) : fetchHotels()
    request
      .then(async (list) => {
        if (resultsSeq.current !== seq) return
        setResults({ phase: 'done', hotels: list })

        // The list endpoint carries no rates, so each card borrows the
        // cheapest room category from its detail call. A failed detail
        // call only removes the price line, never the card.
        const settled = await Promise.allSettled(list.map((hotel) => fetchHotel(hotel.id)))
        if (resultsSeq.current !== seq) return
        const nextRates: RateMap = {}
        settled.forEach((result, index) => {
          const hotel = list[index]
          if (result.status === 'fulfilled') {
            const detail = result.value
            const roomRates = detail.roomTypes.map((room) => room.pricePerNight)
            nextRates[hotel.id] = roomRates.length > 0 ? Math.min(...roomRates) : null
            // The detail answer doubles as compare data for this hotel.
            setCompareSummaries((prev) => ({ ...prev, [hotel.id]: detail }))
            setCompareDetails((prev) => ({ ...prev, [hotel.id]: detail }))
          } else {
            nextRates[hotel.id] = null
          }
        })
        setRates(nextRates)
      })
      .catch((error) => {
        if (resultsSeq.current !== seq) return
        setResults({
          phase: 'error',
          message: error instanceof ApiError ? error.message : 'Something went wrong.',
        })
      })
  }, [destinationParam])

  useEffect(() => {
    loadResults()
  }, [loadResults])

  // The town list behind the location filter. One cheap call; when it
  // fails the list resolves empty and the chips keep "Any town" working
  // rather than showing a made-up set of towns.
  useEffect(() => {
    let alive = true
    fetchHotels()
      .then((list) => {
        if (alive) setTowns(list)
      })
      .catch(() => {
        if (alive) setTowns([])
      })
    return () => {
      alive = false
    }
  }, [])

  // ------------------------------------------------- availability check ---
  useEffect(() => {
    if (results.phase !== 'done') return
    setStays({})
    if (!dates) return
    const seq = ++staysSeq.current
    for (const hotel of results.hotels) {
      fetchAvailability(hotel.id, dates.checkIn, dates.checkOut)
        .then((stay) => {
          if (staysSeq.current !== seq) return
          setStays((prev) => ({ ...prev, [hotel.id]: stay }))
        })
        .catch(() => {
          if (staysSeq.current !== seq) return
          setStays((prev) => ({ ...prev, [hotel.id]: null }))
        })
    }
  }, [results, dates])

  // ------------------------------------------------------ comparison ------
  // Details for a picked hotel that this page has not seen yet (a stay
  // remembered from a previous visit, or one picked in another town).
  useEffect(() => {
    for (const id of compareIds) {
      if (compareDetails[id] !== undefined) continue
      fetchHotel(id)
        .then((detail) => {
          setCompareSummaries((prev) => ({ ...prev, [id]: detail }))
          setCompareDetails((prev) => ({ ...prev, [id]: detail }))
        })
        .catch(() => {
          // The hotel is gone from the API - drop it rather than show a ghost.
          setCompareDetails((prev) => ({ ...prev, [id]: null }))
          setCompareIds((prev) => prev.filter((value) => value !== id))
        })
    }
  }, [compareIds, compareDetails])

  useEffect(() => {
    try {
      window.localStorage.setItem(COMPARE_STORAGE_KEY, JSON.stringify(compareIds))
    } catch {
      // Storage unavailable (private mode); comparison simply lives shorter.
    }
  }, [compareIds])

  function toggleCompare(hotel: HotelSummary) {
    setCompareSummaries((prev) => (prev[hotel.id] ? prev : { ...prev, [hotel.id]: hotel }))
    setCompareIds((prev) => {
      if (prev.includes(hotel.id)) return prev.filter((id) => id !== hotel.id)
      if (prev.length >= COMPARE_LIMIT) return prev
      return [...prev, hotel.id]
    })
  }

  // ------------------------------------------------------ URL updates -----
  /** Town change keeps the dates untouched; filters reset because their
   * option lists belong to the previous result set. */
  function changeTown(town: string) {
    const next = new URLSearchParams(searchParams)
    if (town) next.set('destination', town)
    else next.delete('destination')
    setSearchParams(next)
    setMinRate('')
    setMaxRate('')
    setSelectedAmenities([])
  }

  function applyDates(next: { checkIn: string; checkOut: string }) {
    const updated = new URLSearchParams(searchParams)
    updated.set('checkIn', next.checkIn)
    updated.set('checkOut', next.checkOut)
    setSearchParams(updated)
  }

  function clearDates() {
    const updated = new URLSearchParams(searchParams)
    updated.delete('checkIn')
    updated.delete('checkOut')
    setSearchParams(updated)
  }

  function clearFilters() {
    setMinRate('')
    setMaxRate('')
    setSelectedAmenities([])
  }

  // ------------------------------------------------------ derived data ----
  const listedHotels = results.phase === 'done' ? results.hotels : []
  const ratesSettled =
    listedHotels.length > 0 && listedHotels.every((hotel) => rates[hotel.id] !== undefined)
  const knownRates = listedHotels
    .map((hotel) => rates[hotel.id])
    .filter((rate): rate is number => typeof rate === 'number')
  const rateBounds: RateBounds | null =
    knownRates.length > 0
      ? { min: Math.min(...knownRates), max: Math.max(...knownRates) }
      : null
  // "Loading" is only true while rates are genuinely in flight for a list
  // that has stays in it - an empty result set is not a loading state.
  const ratesLoading =
    results.phase === 'loading' ||
    (results.phase === 'done' && listedHotels.length > 0 && !ratesSettled)

  const amenityOptions: AmenityOption[] = useMemo(() => {
    const counts = new Map<string, number>()
    for (const hotel of listedHotels) {
      for (const amenity of hotel.amenities) {
        counts.set(amenity, (counts.get(amenity) ?? 0) + 1)
      }
    }
    return [...counts.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([name, count]) => ({ name, count }))
  }, [listedHotels])

  const minRateValue = parseRateInput(minRate)
  const maxRateValue = parseRateInput(maxRate)
  const rateRangeInvalid = minRateValue !== null && maxRateValue !== null && minRateValue > maxRateValue

  const visibleHotels = useMemo(() => {
    let list = listedHotels

    // A rate the API has not returned yet cannot honestly match a range,
    // so the price filter only bites once every rate has settled.
    if ((minRateValue !== null || maxRateValue !== null) && ratesSettled && !rateRangeInvalid) {
      list = list.filter((hotel) => {
        const rate = rates[hotel.id]
        if (typeof rate !== 'number') return false
        if (minRateValue !== null && rate < minRateValue) return false
        if (maxRateValue !== null && rate > maxRateValue) return false
        return true
      })
    }

    if (selectedAmenities.length > 0) {
      list = list.filter((hotel) =>
        selectedAmenities.every((amenity) => hotel.amenities.includes(amenity)),
      )
    }

    if (sort === 'asc' || sort === 'desc') {
      list = [...list].sort((a, b) => {
        const rateA = rates[a.id]
        const rateB = rates[b.id]
        // Stays without a settled rate keep to the back of either order
        // instead of pretending to be free or expensive.
        if (typeof rateA !== 'number' || typeof rateB !== 'number') {
          if (typeof rateA === typeof rateB) return 0
          return typeof rateA === 'number' ? -1 : 1
        }
        return sort === 'asc' ? rateA - rateB : rateB - rateA
      })
    }

    return list
  }, [listedHotels, rates, ratesSettled, rateRangeInvalid, minRateValue, maxRateValue, selectedAmenities, sort])

  const townOptions: TownOption[] = useMemo(() => {
    const counts = new Map<string, number>()
    for (const hotel of towns ?? []) {
      counts.set(hotel.city, (counts.get(hotel.city) ?? 0) + 1)
    }
    return [...counts.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([name, stayCount]) => ({ name, stayCount }))
  }, [towns])

  /** Canonical capitalisation of the URL destination, when it matches a real town. */
  const activeTown = useMemo(() => {
    const match = townOptions.find(
      (town) => town.name.toLowerCase() === destinationParam.toLowerCase(),
    )
    return match ? match.name : destinationParam
  }, [townOptions, destinationParam])

  const activeFilterCount =
    (minRateValue !== null || maxRateValue !== null ? 1 : 0) + selectedAmenities.length

  const openCount = dates
    ? visibleHotels.filter((hotel) => {
        const stay = stays[hotel.id]
        return Boolean(stay && stay.roomTypes.some((room) => room.available))
      }).length
    : 0
  const staysAllSettled =
    visibleHotels.length > 0 && visibleHotels.every((hotel) => stays[hotel.id] !== undefined)

  const compareEntries = compareIds.map((id) => {
    const summary = compareSummaries[id]
    return {
      id,
      name: summary?.name ?? 'Fetching details…',
      city: summary?.city,
    }
  })
  const compareHotels = compareIds
    .map((id) => compareSummaries[id])
    .filter((summary): summary is HotelSummary => Boolean(summary))
  const compareLimitReached = compareIds.length >= COMPARE_LIMIT

  /** Card links carry the town and dates so the property page (and its
   * back link) lands in the same context the visitor is browsing in. */
  const detailQuery = useMemo(() => {
    const params = new URLSearchParams()
    if (activeTown) params.set('destination', activeTown)
    if (dates) {
      params.set('checkIn', dates.checkIn)
      params.set('checkOut', dates.checkOut)
    }
    return params.toString()
  }, [activeTown, dates])

  const contextLine = dates
    ? `${formatStayRange(dates.checkIn, dates.checkOut)} · ${nightsLabel(
        nightsBetween(dates.checkIn, dates.checkOut),
      )}`
    : 'Every property, no dates applied'

  const filterPanel = (
    <FilterPanel
      towns={townOptions}
      activeTown={activeTown}
      townsReady={towns !== null}
      onTownChange={changeTown}
      rateBounds={rateBounds}
      ratesLoading={ratesLoading}
      minRate={minRate}
      maxRate={maxRate}
      onMinRateChange={setMinRate}
      onMaxRateChange={setMaxRate}
      rateRangeInvalid={rateRangeInvalid}
      amenities={amenityOptions}
      selectedAmenities={selectedAmenities}
      onAmenitiesChange={setSelectedAmenities}
    />
  )

  return (
    <div className={`collection ${compareIds.length > 0 ? 'collection--with-tray' : ''}`}>
      {/* ------------------------------------------------------ page head */}
      <header className="collection__head container">
        <p className="eyebrow">Our collection</p>
        <h1 className="collection__title">
          {activeTown ? `Stays in ${activeTown}` : 'The collection, in full'}
        </h1>
        <p className="collection__lede">
          Independent houses across India&rsquo;s classic leisure circuit, booked directly.
          Rates, room categories and availability on this page all come from the API as you
          browse &mdash; nothing here is staged.
        </p>

        <StayDatesBar
          checkIn={dates?.checkIn ?? ''}
          checkOut={dates?.checkOut ?? ''}
          warnInvalid={hadDateParams && dates === null}
          onApply={applyDates}
          onClear={clearDates}
        />
      </header>

      <div className="collection__body container">
        {/* ------------------------------------------------- filters rail */}
        <div className="collection__rail">
          <button
            type="button"
            className="collection__filters-toggle"
            aria-expanded={filtersOpen}
            aria-controls="collection-filters"
            onClick={() => setFiltersOpen((open) => !open)}
          >
            {filtersOpen ? 'Hide filters' : 'Filters'}
            {activeFilterCount > 0 && (
              <span className="collection__filters-badge">{activeFilterCount}</span>
            )}
          </button>
          <div id="collection-filters" className={filtersOpen ? 'collection__filters is-open' : 'collection__filters'}>
            {filterPanel}
          </div>
        </div>

        {/* ------------------------------------------------------ results */}
        <section className="collection__results" aria-labelledby="collection-results-title">
          {results.phase === 'loading' && (
            <>
              <header className="collection__results-head">
                <h2 id="collection-results-title">Fetching the collection…</h2>
              </header>
              <ul className="collection__grid" aria-label="Loading stays" aria-busy="true">
                {Array.from({ length: 6 }, (_, index) => (
                  <li key={index}>
                    <SkeletonCard />
                  </li>
                ))}
              </ul>
              <p className="collection__sr-only" role="status">
                Loading stays from the API
              </p>
            </>
          )}

          {results.phase === 'error' && (
            <>
              <header className="collection__results-head">
                <h2 id="collection-results-title">The collection is out of reach</h2>
              </header>
              <Notice
                title="The API did not answer"
                action={
                  <button type="button" className="btn btn--ghost" onClick={loadResults}>
                    Try again
                  </button>
                }
              >
                <p>
                  {results.message} If you are running the demo locally, start Spring Boot on
                  port 8080 and try again.
                </p>
              </Notice>
            </>
          )}

          {results.phase === 'done' && listedHotels.length === 0 && (
            <>
              <header className="collection__results-head">
                <h2 id="collection-results-title" tabIndex={-1}>
                  {activeTown ? `Nothing in ${activeTown} yet` : 'The collection is empty'}
                </h2>
                <p className="collection__context">{contextLine}</p>
              </header>
              <p className="collection__empty-lede">
                The collection grows slowly, one house at a time. These towns already have
                stays:
              </p>
              <div className="collection__chips">
                {townOptions
                  .filter((town) => town.name.toLowerCase() !== activeTown.toLowerCase())
                  .map((town) => (
                    <button
                      key={town.name}
                      type="button"
                      className="collection__chip"
                      onClick={() => changeTown(town.name)}
                    >
                      Browse {town.name}
                    </button>
                  ))}
              </div>
            </>
          )}

          {results.phase === 'done' && listedHotels.length > 0 && (
            <>
              <header className="collection__results-head">
                <div>
                  <h2 id="collection-results-title" tabIndex={-1}>
                    {visibleHotels.length === listedHotels.length
                      ? `${listedHotels.length} ${listedHotels.length === 1 ? 'stay' : 'stays'}`
                      : `${visibleHotels.length} of ${listedHotels.length} stays`}
                  </h2>
                  <p className="collection__context">
                    {contextLine}
                    {dates && staysAllSettled && visibleHotels.length > 0 && (
                      <> · {openCount} {openCount === 1 ? 'is' : 'are'} open for your dates</>
                    )}
                  </p>
                </div>
                <div className="collection__sort">
                  <label htmlFor="collection-sort">Sort</label>
                  <select
                    id="collection-sort"
                    value={sort}
                    onChange={(event) => setSort(event.target.value as SortOrder)}
                  >
                    <option value="curated">Curated order</option>
                    <option value="asc">Price · low to high</option>
                    <option value="desc">Price · high to low</option>
                  </select>
                </div>
              </header>

              {visibleHotels.length === 0 ? (
                <div className="collection__empty">
                  <h3>No stays match these filters</h3>
                  <p>
                    The filters narrowed {listedHotels.length}{' '}
                    {listedHotels.length === 1 ? 'stay' : 'stays'} down to none. Loosen the
                    price range or untick an amenity.
                  </p>
                  <button type="button" className="btn btn--ghost" onClick={clearFilters}>
                    Clear filters
                  </button>
                </div>
              ) : (
                <ul className="collection__grid" aria-busy={!ratesSettled}>
                  {visibleHotels.map((hotel) => {
                    const compared = compareIds.includes(hotel.id)
                    return (
                      <li key={hotel.id}>
                        <HotelCard
                          hotel={hotel}
                          fromPrice={rates[hotel.id]}
                          pricePending={rates[hotel.id] === undefined}
                          stay={dates ? (stays[hotel.id] ?? null) : null}
                          stayFailed={Boolean(dates) && stays[hotel.id] === null}
                          nights={dates ? nightsBetween(dates.checkIn, dates.checkOut) : 0}
                          linkTo={`/hotels/${hotel.id}${detailQuery ? `?${detailQuery}` : ''}`}
                          action={
                            <button
                              type="button"
                              className={
                                compared ? 'compare-toggle is-active' : 'compare-toggle'
                              }
                              aria-pressed={compared}
                              disabled={!compared && compareLimitReached}
                              title={
                                !compared && compareLimitReached
                                  ? 'Three stays are already chosen - remove one first'
                                  : undefined
                              }
                              onClick={() => toggleCompare(hotel)}
                            >
                              {compared ? 'In comparison' : 'Compare'}
                            </button>
                          }
                        />
                      </li>
                    )
                  })}
                </ul>
              )}

              <p className="collection__sr-only" aria-live="polite">
                {visibleHotels.length} of {listedHotels.length} stays shown
              </p>
            </>
          )}
        </section>
      </div>

      {/* ---------------------------------------------------- compare tray */}
      {compareIds.length > 0 && (
        <CompareTray
          entries={compareEntries}
          limitReached={compareLimitReached}
          canCompare={compareIds.length >= 2 && compareHotels.length === compareIds.length}
          onCompare={() => setCompareOpen(true)}
          onRemove={(id) => setCompareIds((prev) => prev.filter((value) => value !== id))}
          onClear={() => setCompareIds([])}
        />
      )}

      {compareOpen && compareHotels.length >= 2 && (
        <CompareModal
          hotels={compareHotels}
          details={compareDetails}
          dates={dates}
          staysSeed={stays}
          onClose={() => setCompareOpen(false)}
        />
      )}
    </div>
  )
}
