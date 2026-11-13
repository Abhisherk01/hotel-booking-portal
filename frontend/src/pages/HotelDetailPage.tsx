import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { ApiError, fetchAvailability, fetchHotel } from '../api/client'
import type { HotelAvailability, HotelDetail } from '../api/types'
import { HotelGallery } from '../components/detail/HotelGallery'
import { AmenityList } from '../components/detail/AmenityIcon'
import { RoomList } from '../components/detail/RoomList'
import { StayDatesBar } from '../components/collection/StayDatesBar'
import { Notice } from '../components/common/Notice'
import { resolveHotelGallery } from '../data/imageCatalog'
import { formatInr, formatStayRange, nightsBetween } from '../lib/format'
import { readStayDates } from '../lib/stayDates'
import './HotelDetailPage.css'

/*
 * The property page. Everything it shows comes from two API calls - the
 * detail endpoint for name, description, amenities and room categories,
 * the availability endpoint for what is actually free on the dates in the
 * URL. The dates ride in the query string exactly as they did on the
 * collection page, so a refresh, a shared link and a back-navigation all
 * land on the same stay with the same dates.
 */

type DetailPhase =
  | { phase: 'loading' }
  | { phase: 'missing' }
  | { phase: 'error'; message: string }
  | { phase: 'done'; hotel: HotelDetail }

export function HotelDetailPage() {
  const { hotelId } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const id = Number(hotelId)
  const idValid = Number.isInteger(id) && id > 0

  // The destination rides along only so "back to the collection" can
  // restore the town filter the visitor arrived from.
  const destinationParam = (searchParams.get('destination') ?? '').trim()
  const { dates, hadDateParams } = useMemo(() => readStayDates(searchParams), [searchParams])

  const [detail, setDetail] = useState<DetailPhase>({ phase: 'loading' })
  /** undefined = idle or loading, null = failed, otherwise the live answer. */
  const [availability, setAvailability] = useState<HotelAvailability | null | undefined>(undefined)
  /** Bumped by the rooms-section retry button; re-runs the availability call. */
  const [availRetry, setAvailRetry] = useState(0)
  const availSeq = useRef(0)

  // ------------------------------------------------------- detail load ---
  const loadDetail = useCallback(() => {
    if (!idValid) {
      setDetail({ phase: 'missing' })
      return
    }
    setDetail({ phase: 'loading' })
    fetchHotel(id)
      .then((hotel) => setDetail({ phase: 'done', hotel }))
      .catch((error: unknown) => {
        if (error instanceof ApiError && error.status === 404) {
          setDetail({ phase: 'missing' })
        } else {
          setDetail({
            phase: 'error',
            message: error instanceof ApiError ? error.message : 'Something went wrong.',
          })
        }
      })
  }, [id, idValid])

  useEffect(() => {
    loadDetail()
  }, [loadDetail])

  // ------------------------------------------------ availability loads ---
  // Runs whenever the hotel or the URL dates change; a seq guard keeps a
  // slow answer for yesterday's dates from overwriting today's.
  useEffect(() => {
    if (detail.phase !== 'done' || !dates) {
      setAvailability(undefined)
      return
    }
    const seq = ++availSeq.current
    setAvailability(undefined)
    fetchAvailability(id, dates.checkIn, dates.checkOut)
      .then((stay) => {
        if (availSeq.current === seq) setAvailability(stay)
      })
      .catch(() => {
        if (availSeq.current === seq) setAvailability(null)
      })
  }, [detail, dates, id, availRetry])

  // --------------------------------------------------------- URL dates ---
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

  /** Back to the listing with the town and dates the visitor arrived with. */
  const backHref = useMemo(() => {
    const params = new URLSearchParams()
    if (destinationParam) params.set('destination', destinationParam)
    if (dates) {
      params.set('checkIn', dates.checkIn)
      params.set('checkOut', dates.checkOut)
    }
    const query = params.toString()
    return `/hotels${query ? `?${query}` : ''}`
  }, [destinationParam, dates])

  if (!idValid || detail.phase === 'missing') {
    return (
      <div className="stay stay--missing container">
        <p className="eyebrow">Not part of the collection</p>
        <h1 className="stay__title">This stay does not exist</h1>
        <p className="stay__lede">
          The API has no property at this address. It may have been retired, or the link may
          have been mistyped &mdash; the collection page shows every stay that is bookable today.
        </p>
        <Link to="/hotels" className="btn btn--ghost">
          Back to the collection
        </Link>
      </div>
    )
  }

  if (detail.phase === 'error') {
    return (
      <div className="stay stay--missing container">
        <p className="eyebrow">The stay is out of reach</p>
        <h1 className="stay__title">The API did not answer</h1>
        <Notice
          title="Something went wrong"
          action={
            <button type="button" className="btn btn--ghost" onClick={loadDetail}>
              Try again
            </button>
          }
        >
          <p>{detail.message} If you are running the demo locally, start Spring Boot on port 8080.</p>
        </Notice>
      </div>
    )
  }

  if (detail.phase === 'loading') {
    return (
      <div className="stay container" aria-busy="true">
        <Link to={backHref} className="stay__back">
          Back to the collection
        </Link>
        <div className="stay__head">
          <div className="stay__skeleton-line stay__skeleton-line--eyebrow" />
          <div className="stay__skeleton-line stay__skeleton-line--title" />
          <div className="stay__skeleton-line stay__skeleton-line--soft" />
        </div>
        <div className="stay__skeleton-gallery" />
        <div className="stay__body">
          <div className="stay__aside">
            <div className="stay__skeleton-panel" />
          </div>
          <div className="stay__main">
            <div className="stay__skeleton-line" />
            <div className="stay__skeleton-line" />
            <div className="stay__skeleton-line stay__skeleton-line--soft" />
          </div>
        </div>
        <p className="stay__sr-only" role="status">
          Loading the stay from the API
        </p>
      </div>
    )
  }

  // ------------------------------------------------------------ loaded ---
  const { hotel } = detail
  const photographs = resolveHotelGallery(hotel.id, hotel.name, hotel.imageUrl)
  const nights = dates ? nightsBetween(dates.checkIn, dates.checkOut) : 0
  const roomRates = hotel.roomTypes.map((room) => room.pricePerNight)
  const fromRate = roomRates.length > 0 ? Math.min(...roomRates) : null

  const openRooms = availability ? availability.roomTypes.filter((room) => room.available) : []
  const cheapestOpen =
    openRooms.length > 0
      ? openRooms.reduce((cheapest, room) =>
          room.pricePerNight < cheapest.pricePerNight ? room : cheapest,
        )
      : null

  return (
    <article className="stay container">
      <Link to={backHref} className="stay__back">
        &larr; Back to the collection
      </Link>

      {/* ------------------------------------------------------ page head */}
      <header className="stay__head">
        <p className="eyebrow">{hotel.city}</p>
        <h1 className="stay__title">{hotel.name}</h1>
        <p className="stay__lede">{hotel.description}</p>
        {fromRate !== null && (
          <p className="stay__from">
            From {formatInr(fromRate)} <span>/ night</span>
          </p>
        )}
      </header>

      {/* ------------------------------------------------------- gallery */}
      <HotelGallery photographs={photographs} hotelName={hotel.name} />

      {/* ---------------------------------------------------------- body */}
      <div className="stay__body">
        <aside className="stay__aside" id="stay-dates" aria-label="Your dates">
          <StayDatesBar
            checkIn={dates?.checkIn ?? ''}
            checkOut={dates?.checkOut ?? ''}
            warnInvalid={hadDateParams && dates === null}
            idPrefix="stay"
            contextNote="rooms and rates below refresh the moment you apply them"
            onApply={applyDates}
            onClear={clearDates}
          />

          {dates && availability && (
            <div className="stay__summary">
              {cheapestOpen ? (
                <>
                  <p className="stay__summary-note">
                    {openRooms.length === 1 ? '1 room category is' : `${openRooms.length} room categories are`}{' '}
                    open for {formatStayRange(dates.checkIn, dates.checkOut)}.
                  </p>
                  <Link
                    to={`/hotels/${hotel.id}/book?roomTypeId=${cheapestOpen.roomTypeId}&checkIn=${dates.checkIn}&checkOut=${dates.checkOut}`}
                    className="btn btn--primary stay__reserve"
                  >
                    Reserve from {formatInr(cheapestOpen.pricePerNight)} / night
                  </Link>
                </>
              ) : (
                <p className="stay__summary-note stay__summary-note--closed">
                  Every room category is taken for your dates. Shifting the stay by a day or two
                  is often enough &mdash; apply new dates above.
                </p>
              )}
            </div>
          )}

          {dates && availability === null && (
            <p className="stay__summary-note" role="status">
              Availability could not be checked for these dates just now &mdash; the rooms section
              below offers a retry.
            </p>
          )}
        </aside>

        <div className="stay__main">
          <section className="stay__section" aria-labelledby="stay-amenities-title">
            <h2 id="stay-amenities-title">What this stay offers</h2>
            <AmenityList amenities={hotel.amenities} />
          </section>

          <section className="stay__section" aria-labelledby="stay-rooms-title">
            <h2 id="stay-rooms-title">
              {dates ? 'Rooms for your dates' : 'Rooms & nightly rates'}
            </h2>
            <RoomList
              hotelId={hotel.id}
              hotelName={hotel.name}
              dates={dates}
              nights={nights}
              availability={availability}
              roomTypes={hotel.roomTypes}
              onRetry={() => setAvailRetry((nonce) => nonce + 1)}
            />
          </section>
        </div>
      </div>
    </article>
  )
}
