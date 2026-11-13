import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import type { HotelAvailability, HotelDetail, HotelSummary } from '../../api/types'
import { fetchAvailability } from '../../api/client'
import { SmartImage } from '../common/SmartImage'
import { resolveHotelCover } from '../../data/imageCatalog'
import { formatInr, formatStayRange, nightsBetween, nightsLabel } from '../../lib/format'
import './CompareModal.css'

type CompareModalProps = {
  hotels: HotelSummary[]
  /** Detail answers keyed by hotel id; null means the call failed. */
  details: Record<number, HotelDetail | null>
  dates: { checkIn: string; checkOut: string } | null
  /** Availability answers already fetched by the listing, reused as a seed. */
  staysSeed: Record<number, HotelAvailability | null | undefined>
  onClose: () => void
}

/*
 * Side-by-side comparison of two or three stays, every cell fed by the
 * API: room category and base rate from the detail endpoint, availability
 * and stay totals from the availability endpoint for the chosen dates.
 * There are no ratings or review scores anywhere because the backend has
 * none to give, and the page refuses to invent them.
 */
export function CompareModal({ hotels, details, dates, staysSeed, onClose }: CompareModalProps) {
  const [stays, setStays] = useState<Record<number, HotelAvailability | null | undefined>>(() => {
    const seeded: Record<number, HotelAvailability | null | undefined> = {}
    for (const hotel of hotels) seeded[hotel.id] = staysSeed[hotel.id]
    return seeded
  })
  const closeRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const staysSeq = useRef(0)

  // Availability for stays the listing never had to ask about (a hotel
  // picked from another town, say). One quiet fan-out, same honesty rules.
  useEffect(() => {
    if (!dates) return
    const seq = ++staysSeq.current
    for (const hotel of hotels) {
      if (stays[hotel.id] !== undefined) continue
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])  // runs once per opening; the listing's own answers already seeded the map

  // Dialog plumbing: move focus in, keep it here, hand it back on close.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeRef.current?.focus()

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose()
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
  }, [])  // the dialog mounts once per opening, and onClose never changes identity

  const nights = dates ? nightsBetween(dates.checkIn, dates.checkOut) : 0
  const gridStyle = { '--columns': hotels.length } as CSSProperties

  const rows = useMemo(() => {
    return hotels.map((hotel) => {
      const detail = details[hotel.id]
      const stay = stays[hotel.id]
      const baseRate = detail
        ? detail.roomTypes.length > 0
          ? Math.min(...detail.roomTypes.map((room) => room.pricePerNight))
          : null
        : null
      const openRooms = stay ? stay.roomTypes.filter((room) => room.available) : []
      const cheapestOpen = openRooms.length > 0
        ? openRooms.reduce((cheapest, room) =>
            room.pricePerNight < cheapest.pricePerNight ? room : cheapest,
          )
        : null
      return { hotel, detail, stay, baseRate, cheapestOpen }
    })
  }, [hotels, details, stays])

  return (
    <div className="compare-modal" role="presentation" onClick={onClose}>
      <div
        ref={dialogRef}
        className="compare-modal__dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="compare-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="compare-modal__head">
          <div>
            <p className="eyebrow">Side by side</p>
            <h2 id="compare-modal-title">
              Comparing {hotels.length} {hotels.length === 1 ? 'stay' : 'stays'}
              {dates ? ` · ${formatStayRange(dates.checkIn, dates.checkOut)}` : ''}
            </h2>
          </div>
          <button
            ref={closeRef}
            type="button"
            className="compare-modal__close"
            onClick={onClose}
            aria-label="Close comparison"
          >
            Close
          </button>
        </header>

        <div className="compare-modal__scroller">
          <div className="compare-modal__grid" style={gridStyle}>
            {/* photography row */}
            <div className="compare-modal__cell compare-modal__cell--label" aria-hidden="true" />
            {rows.map(({ hotel }) => {
              const cover = resolveHotelCover(hotel.id, hotel.name, hotel.imageUrl)
              return (
                <div key={`media-${hotel.id}`} className="compare-modal__media">
                  <SmartImage src={cover.src} alt={cover.alt} />
                </div>
              )
            })}

            {/* name + town */}
            <div className="compare-modal__cell compare-modal__cell--label">Stay</div>
            {rows.map(({ hotel }) => (
              <div key={`name-${hotel.id}`} className="compare-modal__cell">
                <p className="compare-modal__name">{hotel.name}</p>
                <p className="compare-modal__town">{hotel.city}</p>
              </div>
            ))}

            {/* room category */}
            <div className="compare-modal__cell compare-modal__cell--label">Room category</div>
            {rows.map(({ hotel, detail }) => (
              <div key={`room-${hotel.id}`} className="compare-modal__cell">
                {detail && detail.roomTypes.length > 0
                  ? detail.roomTypes.map((room) => room.name).join(', ')
                  : 'Not loaded right now'}
              </div>
            ))}

            {/* base rate */}
            <div className="compare-modal__cell compare-modal__cell--label">Rate per night</div>
            {rows.map(({ hotel, baseRate }) => (
              <div key={`rate-${hotel.id}`} className="compare-modal__cell compare-modal__cell--rate">
                {baseRate !== null ? formatInr(baseRate) : '—'}
              </div>
            ))}

            {/* dated availability + total */}
            {dates && (
              <>
                <div className="compare-modal__cell compare-modal__cell--label">
                  For your dates
                  <span className="compare-modal__label-hint">
                    {nightsLabel(nights)}, checked live
                  </span>
                </div>
                {rows.map(({ hotel, stay, cheapestOpen }) => (
                  <div key={`stay-${hotel.id}`} className="compare-modal__cell">
                    {stay === undefined && <p className="compare-modal__pending">Checking…</p>}
                    {stay === null && <p className="compare-modal__muted">Could not be checked</p>}
                    {stay && cheapestOpen && (
                      <p className="compare-modal__total">
                        <span className="compare-modal__flag compare-modal__flag--open">
                          Available
                        </span>
                        {formatInr(cheapestOpen.pricePerNight * nights)} total
                      </p>
                    )}
                    {stay && !cheapestOpen && (
                      <p className="compare-modal__total">
                        <span className="compare-modal__flag compare-modal__flag--closed">
                          Sold out
                        </span>
                        No rooms free for these dates
                      </p>
                    )}
                  </div>
                ))}
              </>
            )}

            {/* amenities */}
            <div className="compare-modal__cell compare-modal__cell--label">Amenities</div>
            {rows.map(({ hotel }) => (
              <div key={`amenities-${hotel.id}`} className="compare-modal__cell">
                <ul className="compare-modal__amenities" aria-label={`Amenities of ${hotel.name}`}>
                  {hotel.amenities.map((amenity) => (
                    <li key={amenity}>{amenity}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <p className="compare-modal__footnote">
          {dates
            ? 'Room categories, rates and availability come straight from the API for the dates shown.'
            : 'Room categories and rates come straight from the API. Pick dates on the listing to add live availability and stay totals.'}
        </p>
      </div>
    </div>
  )
}
