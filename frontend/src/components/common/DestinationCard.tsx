import { Link } from 'react-router-dom'
import { SmartImage } from './SmartImage'
import { destinationPhotographs } from '../../data/imageCatalog'
import './DestinationCard.css'

/** One short line of city copy per destination, echoing the seed data. */
const cityMoods: Record<string, string> = {
  Jaipur: 'Haveli courtyards, bazaar walks, the Aravalli ridge at dusk.',
  Udaipur: 'Lake mornings, ghats at dusk, a boat waiting at the door.',
  Goa: 'Salt air, veranda afternoons, seafood grills at sundown.',
  Kochi: 'Spice warehouses, Chinese fishing nets, colonial verandas.',
  Manali: 'Cedar forest, snowmelt air, trails starting at the gate.',
}

type DestinationCardProps = {
  city: string
  /** Real count from the API; omitted while the collection is still loading. */
  stayCount?: number
}

/*
 * A town card that links into the collection listing, pre-filtered to that
 * destination. Shared by the homepage and the Destinations page so both
 * always land on the same, real search results.
 */
export function DestinationCard({ city, stayCount }: DestinationCardProps) {
  const photo = destinationPhotographs[city]
  const mood = cityMoods[city] ?? 'A town in the collection.'
  const countLine =
    stayCount === undefined
      ? mood
      : `${stayCount} ${stayCount === 1 ? 'stay' : 'stays'} · ${mood}`

  return (
    <Link
      to={`/hotels?destination=${encodeURIComponent(city)}`}
      className="destination-card"
      aria-label={`Browse stays in ${city}`}
    >
      <div className="destination-card__media">
        {photo && <SmartImage src={photo.src} alt="" />}
      </div>
      <div className="destination-card__body">
        <h3>{city}</h3>
        <p>{countLine}</p>
        <span className="destination-card__action" aria-hidden="true">
          Browse {city}
        </span>
      </div>
    </Link>
  )
}
