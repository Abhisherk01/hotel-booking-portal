import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ApiError, fetchHotel, fetchHotels } from '../api/client'
import type { HotelSummary } from '../api/types'
import { HotelCard } from '../components/home/HotelCard'
import { SearchPanel, type StayQuery } from '../components/home/SearchPanel'
import { SkeletonCard } from '../components/common/SkeletonCard'
import { Notice } from '../components/common/Notice'
import { DestinationCard } from '../components/common/DestinationCard'
import { SmartImage } from '../components/common/SmartImage'
import { editorialPhotograph, heroPhotograph } from '../data/imageCatalog'
import './HomePage.css'

/**
 * Cheapest room rate per hotel, keyed by id. undefined = the detail call
 * is still in flight, null = it failed (the card then simply hides its
 * rate line instead of inventing a number).
 */
type PriceMap = Record<number, number | null | undefined>

export function HomePage() {
  const navigate = useNavigate()
  const [hotels, setHotels] = useState<HotelSummary[] | null>(null)
  const [hotelsError, setHotelsError] = useState<string | null>(null)
  const [fromPriceByHotel, setFromPriceByHotel] = useState<PriceMap>({})
  const [draft, setDraft] = useState<StayQuery>({ city: '', checkIn: '', checkOut: '' })

  const collectionSeq = useRef(0)

  /*
   * The collection block owns its loading state so the retry button and
   * the mount effect share one code path. A sequence ref keeps a slow
   * earlier attempt from overwriting a newer answer.
   */
  const loadCollection = useCallback(() => {
    const seq = ++collectionSeq.current
    setHotels(null)
    setHotelsError(null)
    setFromPriceByHotel({})

    fetchHotels()
      .then(async (list) => {
        if (collectionSeq.current !== seq) return
        setHotels(list)
        // The list endpoint carries no rates, so each card borrows the
        // cheapest room category from its detail call. A failed detail
        // call only removes the price line, never the card.
        const settled = await Promise.allSettled(list.map((hotel) => fetchHotel(hotel.id)))
        if (collectionSeq.current !== seq) return
        const prices: PriceMap = {}
        settled.forEach((result, index) => {
          if (result.status === 'fulfilled') {
            const rates = result.value.roomTypes.map((room) => room.pricePerNight)
            prices[list[index].id] = rates.length > 0 ? Math.min(...rates) : null
          } else {
            prices[list[index].id] = null
          }
        })
        setFromPriceByHotel(prices)
      })
      .catch((error) => {
        if (collectionSeq.current !== seq) return
        setHotelsError(error instanceof ApiError ? error.message : 'The API did not answer.')
      })
  }, [])

  useEffect(() => {
    loadCollection()
  }, [loadCollection])

  const cities = useMemo(() => [...new Set((hotels ?? []).map((hotel) => hotel.city))], [hotels])

  const staysByCity = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const hotel of hotels ?? []) {
      counts[hotel.city] = (counts[hotel.city] ?? 0) + 1
    }
    return counts
  }, [hotels])

  /*
   * Searching hands the query to the collection listing page, which keeps
   * destination and dates in its URL. The homepage used to render results
   * inline; since the listing exists, one search journey is cleaner than
   * two, and the dates survive every filter change over there.
   */
  function goToCollection(query: StayQuery) {
    const params = new URLSearchParams()
    params.set('destination', query.city)
    if (query.checkIn && query.checkOut) {
      params.set('checkIn', query.checkIn)
      params.set('checkOut', query.checkOut)
    }
    navigate(`/hotels?${params.toString()}`)
  }

  const citiesLoading = hotels === null && hotelsError === null

  return (
    <div className="home">
      {/* ---------------------------------------------------------- hero */}
      <section className="hero" aria-labelledby="hero-title">
        <div className="hero__media" aria-hidden="true">
          <SmartImage src={heroPhotograph.src} alt="" eager />
        </div>
        <div className="hero__scrim" aria-hidden="true" />

        <div className="hero__content container">
          <p className="eyebrow hero__eyebrow">The Aurelia Collection</p>
          <h1 id="hero-title" className="hero__title">
            Rooms worth the journey.
          </h1>
          <p className="hero__lede">
            Five independent houses across India&rsquo;s classic leisure circuit
            &mdash; from a Jaipur haveli to a cedar lodge above Old Manali
            &mdash; booked directly, priced honestly.
          </p>
        </div>

        <div className="hero__panel container">
          <SearchPanel
            cities={cities}
            citiesLoading={citiesLoading}
            busy={false}
            value={draft}
            onChange={setDraft}
            onSubmit={goToCollection}
          />
        </div>
      </section>

      {/* ------------------------------------------------------ featured */}
      <section className="home__section container" aria-labelledby="featured-title">
        <header className="home__section-head">
          <p className="eyebrow">Featured stays</p>
          <h2 id="featured-title">This season&rsquo;s collection</h2>
        </header>

        {hotelsError && (
          <Notice
            title="The collection is out of reach"
            action={
              <button type="button" className="btn btn--ghost" onClick={loadCollection}>
                Try again
              </button>
            }
          >
            <p>
              The API did not answer ({hotelsError}). If you are running the demo
              locally, start Spring Boot on port 8080 and try again.
            </p>
          </Notice>
        )}

        {!hotelsError && hotels === null && (
          <ul className="home__grid" aria-label="Loading the collection" aria-busy="true">
            {Array.from({ length: 5 }, (_, index) => (
              <li key={index}>
                <SkeletonCard />
              </li>
            ))}
          </ul>
        )}

        {hotels !== null && (
          <ul className="home__grid">
            {hotels.map((hotel) => (
              <li key={hotel.id}>
                <HotelCard
                  hotel={hotel}
                  fromPrice={fromPriceByHotel[hotel.id]}
                  pricePending={fromPriceByHotel[hotel.id] === undefined}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ----------------------------------------------------- editorial */}
      <section className="editorial" aria-labelledby="editorial-title">
        <div className="container editorial__inner">
          <div className="editorial__media">
            <SmartImage
              src={editorialPhotograph.src}
              alt={editorialPhotograph.alt}
            />
          </div>
          <div className="editorial__text">
            <p className="eyebrow">Why book direct</p>
            <h2 id="editorial-title">No accounts, no hidden steps.</h2>
            <p>
              Every reservation is written against the hotel&rsquo;s own inventory
              at the moment you confirm it, at the rate you were quoted. Your
              reference number works immediately &mdash; retrieve or cancel a stay
              without phoning anyone.
            </p>
            <Link to="/hotels" className="btn btn--ghost editorial__cta">
              Browse the collection
            </Link>
          </div>
        </div>
      </section>

      {/* --------------------------------------------------- destinations */}
      {hotels !== null && (
        <section className="home__section home__section--tinted" aria-labelledby="destinations-title">
          <div className="container">
            <header className="home__section-head">
              <p className="eyebrow">Destinations</p>
              <h2 id="destinations-title">Five towns we know well</h2>
              <p className="home__section-sub">
                Every card opens the collection listing, already filtered to that
                town &mdash; no dead ends.
              </p>
            </header>

            <ul className="destination-grid">
              {[...new Set(hotels.map((hotel) => hotel.city))].map((city) => (
                <li key={city}>
                  <DestinationCard city={city} stayCount={staysByCity[city] ?? 0} />
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}
    </div>
  )
}
