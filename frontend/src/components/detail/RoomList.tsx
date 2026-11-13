import type { HotelAvailability, RoomTypeSummary } from '../../api/types'
import { Link } from 'react-router-dom'
import { Notice } from '../common/Notice'
import { formatInr, nightsLabel } from '../../lib/format'
import './RoomList.css'

type RoomListProps = {
  hotelId: number
  hotelName: string
  /** Dates in the URL; null means browsing without dates. */
  dates: { checkIn: string; checkOut: string } | null
  nights: number
  /**
   * The availability answer for those dates: undefined while loading,
   * null when the call failed. Ignored when dates is null.
   */
  availability: HotelAvailability | null | undefined
  /** Room categories from the detail endpoint, used when no dates are set. */
  roomTypes: RoomTypeSummary[]
  onRetry: () => void
}

/*
 * The room rows under the gallery. With dates, each row answers the only
 * two questions that matter - is it free, and what does the stay cost -
 * both from the availability endpoint. Without dates the rows fall back
 * to the detail endpoint's categories and honestly say availability is
 * not being checked yet. Nothing here is ever inferred or invented.
 */
export function RoomList({ hotelId, hotelName, dates, nights, availability, roomTypes, onRetry }: RoomListProps) {
  if (!dates) {
    return (
      <div className="rooms">
        <p className="rooms__quiet" role="status">
          These are the stay&rsquo;s room categories and nightly rates. Add your dates above
          and this list re-checks live availability against the API.
        </p>
        <ul className="rooms__list" aria-label="Room categories and nightly rates">
          {roomTypes.map((room) => (
            <li key={room.id} className="rooms__row rooms__row--undated">
              <div className="rooms__info">
                <h3 className="rooms__name">{room.name}</h3>
                <p className="rooms__capacity">Sleeps {room.capacity}</p>
              </div>
              <div className="rooms__rate">
                <p className="rooms__price">
                  {formatInr(room.pricePerNight)} <span>/ night</span>
                </p>
              </div>
              <div className="rooms__cta">
                <Link to={`/hotels/${hotelId}`} className="btn btn--ghost rooms__book">
                  Choose dates
                </Link>
              </div>
            </li>
          ))}
          {roomTypes.length === 0 && (
            <li className="rooms__row rooms__row--undated">
              <p className="rooms__quiet">The API lists no room categories for this stay yet.</p>
            </li>
          )}
        </ul>
      </div>
    )
  }

  if (availability === undefined) {
    return (
      <div className="rooms" aria-busy="true">
        <p className="rooms__quiet" role="status">
          Checking live availability for your dates…
        </p>
        <ul className="rooms__list" aria-label="Loading room availability">
          {roomTypes.map((room) => (
            <li key={room.id} className="rooms__row rooms__row--skeleton">
              <div className="rooms__skeleton-line" />
              <div className="rooms__skeleton-line rooms__skeleton-line--short" />
            </li>
          ))}
        </ul>
      </div>
    )
  }

  if (availability === null) {
    return (
      <Notice
        title="Availability could not be checked"
        action={
          <button type="button" className="btn btn--ghost" onClick={onRetry}>
            Check again
          </button>
        }
      >
        <p>
          The availability call for {hotelName} did not answer just now. Nothing
          on this page guesses at what is free &mdash; try again.
        </p>
      </Notice>
    )
  }

  const openCount = availability.roomTypes.filter((room) => room.available).length

  return (
    <div className="rooms">
      <p className="rooms__context" role="status">
        {openCount === 0
          ? 'No room categories are free for your dates.'
          : `${openCount} of ${availability.roomTypes.length} room categories ${
              openCount === 1 ? 'is' : 'are'
            } free for your dates, checked live against the API.`}
      </p>
      <ul className="rooms__list" aria-label="Room availability for your dates">
        {availability.roomTypes.map((room) => (
          <li
            key={room.roomTypeId}
            className={room.available ? 'rooms__row' : 'rooms__row rooms__row--closed'}
          >
            <div className="rooms__info">
              <h3 className="rooms__name">{room.name}</h3>
              <p className="rooms__capacity">Sleeps {room.capacity}</p>
            </div>
            <div className="rooms__rate">
              <p className="rooms__price">
                {formatInr(room.pricePerNight)} <span>/ night</span>
              </p>
              {room.available && nights > 0 && (
                <p className="rooms__total">
                  {formatInr(room.pricePerNight * nights)} for {nightsLabel(nights)}
                </p>
              )}
            </div>
            <div className="rooms__cta">
              {room.available ? (
                <>
                  <span className="rooms__flag rooms__flag--open">Available</span>
                  <Link
                    to={`/hotels/${hotelId}/book?roomTypeId=${room.roomTypeId}&checkIn=${dates.checkIn}&checkOut=${dates.checkOut}`}
                    className="btn btn--primary rooms__book"
                  >
                    Reserve
                  </Link>
                </>
              ) : (
                <>
                  <span className="rooms__flag rooms__flag--closed">Sold out</span>
                  <p className="rooms__closed-note">No units free for these dates</p>
                </>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
