import type { ReactNode } from 'react'
import type { HotelAvailability, HotelSummary } from '../../api/types'
import { SmartImage } from '../common/SmartImage'
import { resolveHotelCover } from '../../data/imageCatalog'
import { formatInr, nightsLabel } from '../../lib/format'
import './HotelCard.css'

type HotelCardProps = {
  hotel: HotelSummary
  /** Cheapest room rate from the hotel's detail call; null when it could not be fetched. */
  fromPrice?: number | null
  pricePending?: boolean
  /** Present when the visitor searched with dates. */
  stay?: HotelAvailability | null
  /** True when the availability call for the chosen dates failed outright. */
  stayFailed?: boolean
  nights?: number
  /** Optional extra row in the card footer (the collection page puts its Compare toggle here). */
  action?: ReactNode
}

/*
 * The one card used by the featured grid, the collection listing and live
 * search results. It is deliberately a plain article, not a link: the
 * property pages they would point at are built in a later milestone, and
 * a dead link is worse than an honest card.
 */
export function HotelCard({
  hotel,
  fromPrice,
  pricePending = false,
  stay,
  stayFailed = false,
  nights = 0,
  action,
}: HotelCardProps) {
  const cover = resolveHotelCover(hotel.id, hotel.name, hotel.imageUrl)
  const shownAmenities = hotel.amenities.slice(0, 3)
  const extraAmenities = hotel.amenities.length - shownAmenities.length

  const openRooms = stay ? stay.roomTypes.filter((room) => room.available) : []
  const cheapestOpen = openRooms.length > 0
    ? openRooms.reduce((cheapest, room) =>
        room.pricePerNight < cheapest.pricePerNight ? room : cheapest)
    : null

  return (
    <article className="hotel-card">
      <div className="hotel-card__media">
        <SmartImage src={cover.src} alt={cover.alt} />
      </div>

      <div className="hotel-card__body">
        <p className="hotel-card__city">{hotel.city}</p>
        <h3 className="hotel-card__name">{hotel.name}</h3>
        <p className="hotel-card__description">{hotel.description}</p>

        {shownAmenities.length > 0 && (
          <ul className="hotel-card__amenities" aria-label="Amenities">
            {shownAmenities.map((amenity) => (
              <li key={amenity}>{amenity}</li>
            ))}
            {extraAmenities > 0 && <li className="hotel-card__amenity-more">+{extraAmenities} more</li>}
          </ul>
        )}
      </div>

      <div className="hotel-card__meta">
        {stay && cheapestOpen && nights > 0 && (
          <p className="hotel-card__stay">
            <span className="hotel-card__stay-flag">Available</span>
            {formatInr(cheapestOpen.pricePerNight)} / night · {formatInr(cheapestOpen.pricePerNight * nights)} for{' '}
            {nightsLabel(nights)}
          </p>
        )}

        {stay && !cheapestOpen && (
          <p className="hotel-card__stay hotel-card__stay--closed">
            <span className="hotel-card__stay-flag hotel-card__stay-flag--closed">Sold out</span>
            No rooms free for these dates
          </p>
        )}

        {!stay && (fromPrice != null || pricePending) && (
          <p className="hotel-card__price">
            {fromPrice != null
              ? `From ${formatInr(fromPrice)} / night`
              : 'Checking rates…'}
          </p>
        )}

        {stayFailed && !stay && (
          <p className="hotel-card__stay hotel-card__stay--unknown">
            <span className="hotel-card__stay-flag hotel-card__stay-flag--unknown">Not checked</span>
            Availability could not be checked just now
          </p>
        )}

        {action && <div className="hotel-card__action">{action}</div>}
      </div>
    </article>
  )
}
