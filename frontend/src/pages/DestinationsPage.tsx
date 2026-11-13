import { useCallback, useEffect, useMemo, useState } from 'react'
import { ApiError, fetchHotels } from '../api/client'
import type { HotelSummary } from '../api/types'
import { DestinationCard } from '../components/common/DestinationCard'
import { SkeletonCard } from '../components/common/SkeletonCard'
import { Notice } from '../components/common/Notice'
import './DestinationsPage.css'

/*
 * Five towns, one card each, every card landing on the collection listing
 * pre-filtered to that destination. The towns and the stay counts come
 * from the live API - if the list cannot load, the page says so instead
 * of showing a rehearsed list.
 */
export function DestinationsPage() {
  const [hotels, setHotels] = useState<HotelSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    setHotels(null)
    setError(null)
    fetchHotels()
      .then(setHotels)
      .catch((cause) => {
        setError(cause instanceof ApiError ? cause.message : 'The API did not answer.')
      })
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const towns = useMemo(() => {
    const counts = new Map<string, number>()
    for (const hotel of hotels ?? []) {
      counts.set(hotel.city, (counts.get(hotel.city) ?? 0) + 1)
    }
    return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [hotels])

  return (
    <div className="destinations">
      <header className="destinations__head container">
        <p className="eyebrow">Destinations</p>
        <h1 className="destinations__title">Five towns we know well</h1>
        <p className="destinations__lede">
          From a restored Jaipur haveli to a cedar lodge above Old Manali. Every card opens the
          collection listing, already filtered to that town, with the counts below pulled from
          the API as the page loads.
        </p>
      </header>

      <section className="destinations__body container" aria-label="Destinations">
        {error && (
          <Notice
            title="The map is out of reach"
            action={
              <button type="button" className="btn btn--ghost" onClick={load}>
                Try again
              </button>
            }
          >
            <p>
              The API did not answer ({error}). If you are running the demo locally, start
              Spring Boot on port 8080 and try again.
            </p>
          </Notice>
        )}

        {!error && hotels === null && (
          <ul className="destination-grid" aria-label="Loading destinations" aria-busy="true">
            {Array.from({ length: 3 }, (_, index) => (
              <li key={index}>
                <SkeletonCard />
              </li>
            ))}
          </ul>
        )}

        {!error && hotels !== null && towns.length === 0 && (
          <Notice title="No destinations to show" tone="info">
            <p>The collection is empty right now. Once a property is seeded, its town appears here.</p>
          </Notice>
        )}

        {!error && hotels !== null && towns.length > 0 && (
          <ul className="destination-grid">
            {towns.map(([city, stayCount]) => (
              <li key={city}>
                <DestinationCard city={city} stayCount={stayCount} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
