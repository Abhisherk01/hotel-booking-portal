import { useState } from 'react'
import type { Photograph } from '../../data/imageCatalog'
import { SmartImage } from '../common/SmartImage'
import './HotelGallery.css'

type HotelGalleryProps = {
  photographs: Photograph[]
  hotelName: string
}

/*
 * The editorial gallery: one large featured frame and a quiet thumb rail
 * beneath it. Thumbs are buttons (keyboard reachable, aria-pressed), the
 * featured frame crossfades on change, and every image flows through
 * SmartImage so a broken asset degrades to the branded fallback.
 */
export function HotelGallery({ photographs, hotelName }: HotelGalleryProps) {
  const [active, setActive] = useState(0)
  const current = photographs[Math.min(active, photographs.length - 1)]

  return (
    <figure className="gallery">
      <div className="gallery__frame" key={current.src}>
        <SmartImage src={current.src} alt={current.alt} eager={active === 0} />
      </div>

      {photographs.length > 1 && (
        <div className="gallery__thumbs" role="group" aria-label={`${hotelName} photographs`}>
          {photographs.map((photo, index) => (
            <button
              key={photo.src}
              type="button"
              className={index === active ? 'gallery__thumb is-active' : 'gallery__thumb'}
              aria-pressed={index === active}
              aria-label={`Show photograph ${index + 1} of ${photographs.length}: ${photo.alt}`}
              onClick={() => setActive(index)}
            >
              <SmartImage src={photo.src} alt="" />
            </button>
          ))}
        </div>
      )}

      <figcaption className="gallery__caption">
        Photography is paired to the property&rsquo;s character, not its actual walls &mdash;
        the API carries no photography for seeded stays.
      </figcaption>
    </figure>
  )
}
