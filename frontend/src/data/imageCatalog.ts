/*
 * Central registry for the property photography shipped with the frontend.
 *
 * The database `image_url` column stays NULL by agreement (V3 migration):
 * when a hotel eventually carries a real URL it wins, and this catalog only
 * backfills the gap. Placement reasoning lives in docs/IMAGE-INVENTORY.md.
 *
 * Honesty rule: none of these photographs are of the actual seeded
 * properties, so every set carries a `note` describing how close the
 * pairing is. When a photo would misrepresent a property, it is left out
 * of that property's set (img-10 is benched for exactly this reason).
 */

import heroTwilight from '../assets/brand/aurelia-twilight-entrance.jpg'
import img1 from '../assets/hotels/img-1.jpg'
import img2 from '../assets/hotels/img-2.jpg'
import img3 from '../assets/hotels/img-3.jpg'
import img4 from '../assets/hotels/img-4.jpg'
import img5 from '../assets/hotels/img-5.jpg'
import img6 from '../assets/hotels/img-6.jpg'
import img7 from '../assets/hotels/img-7.jpg'
import img8 from '../assets/hotels/img-8.jpg'
import img9 from '../assets/hotels/img-9.jpg'
import img10 from '../assets/hotels/img-10.jpg'

export interface Photograph {
  src: string
  alt: string
}

export interface HotelPhotographs {
  cover: Photograph
  gallery: Photograph[]
  note: string
}

/**
 * Homepage hero: the commissioned entrance shot of The Aurelia Collection
 * itself - palm-lined drive, canopy lights and a limousine under a
 * violet-orange sky. Brand-level imagery makes no claim about any single
 * seeded property, which is exactly what a hero should be.
 */
export const heroPhotograph: Photograph = {
  src: heroTwilight,
  alt: 'The Aurelia Collection entrance at twilight - a palm-lined drive beneath a violet-orange sky, warm canopy lights and a black limousine waiting at the door',
}

/** Editorial "brand experience" block on the homepage. */
export const editorialPhotograph: Photograph = {
  src: img3,
  alt: 'Wooden loungers beside a still pool at golden hour, reflected in the water alongside minimalist white architecture',
}

/** Every shipped asset with its canonical alt text (styleguide + galleries). */
export const allPhotographs: Photograph[] = [
  { src: heroTwilight, alt: 'The Aurelia Collection entrance at twilight, limousine at the canopy-lit door' },
  { src: img1, alt: 'Sun loungers with white parasols on a timber pool deck lined with palms' },
  { src: img2, alt: 'Guest room with warm lighting and a balcony looking out over palms and hills' },
  { src: img3, alt: 'Pool terrace at golden hour with minimalist white architecture' },
  { src: img4, alt: 'A golden filigree bridge crossing a lagoon pool in front of a curved hotel facade' },
  { src: img5, alt: 'Contemporary guest room in grey and white with a mirrored wardrobe' },
  { src: img6, alt: 'Infinity pool merging with the sea, framed by wooden sunbeds' },
  { src: img7, alt: 'Resort pool with a round jacuzzi, white loungers and orange parasols under palms' },
  { src: img8, alt: 'Courtyard pool with a central fountain, seen from above, ringed by arched balconies' },
  { src: img9, alt: 'Grand heritage lobby with marble columns, brass lifts and mosaic murals' },
  { src: img10, alt: 'Large outdoor pool lined with orange loungers in front of a neoclassical facade' },
]

const shotBySrc = new Map(allPhotographs.map((photo) => [photo.src, photo]))

/** Gallery entries reuse the canonical alt text of each asset. */
function shots(...srcs: string[]): Photograph[] {
  return srcs.map((src) => shotBySrc.get(src) ?? { src, alt: 'Property photograph' })
}

export const hotelPhotographs: Record<number, HotelPhotographs> = {
  1: {
    cover: { src: img8, alt: 'Courtyard pool with a fountain, ringed by arched balconies of a warm-toned building' },
    gallery: shots(img8, img2, img5),
    note: 'Courtyard pool and arched balconies echo the haveli courtyard; no true heritage-facade photo exists yet.',
  },
  2: {
    cover: { src: img4, alt: 'Ornate golden filigree bridge over still lagoon water' },
    gallery: shots(img4, img3, img2),
    note: 'Ornate craft over water suits Udaipur\'s character; the facade is far more modern than a stone villa.',
  },
  3: {
    cover: { src: img7, alt: 'Resort pool under tall palms with the sea visible beyond' },
    gallery: shots(img7, img6, img1),
    note: 'Closest coastal match; palms and water read correctly for a Goa beach house.',
  },
  4: {
    cover: { src: img9, alt: 'Grand heritage lobby with marble columns and brass lifts' },
    gallery: shots(img9, img5, img8),
    note: 'Reads as a colonial-era grand lobby; the mosaic murals are not Kerala-specific.',
  },
  5: {
    cover: { src: img2, alt: 'Guest room balcony overlooking palms and hillsides' },
    gallery: shots(img2, img5),
    note: 'The only photo with a mountain view, matching the lodge\'s mountain-facing balconies; palms break the Himalayan illusion.',
  },
}

/**
 * Resolve the cover image for a hotel. A database-provided URL always
 * wins; the catalog is a backfill, and the caller's SmartImage renders
 * the branded fallback if both paths fail.
 */
export function resolveHotelCover(
  hotelId: number,
  hotelName: string,
  remoteUrl?: string | null,
): Photograph {
  if (remoteUrl) {
    return { src: remoteUrl, alt: `${hotelName} - property photograph` }
  }
  const set = hotelPhotographs[hotelId]
  if (set) return set.cover
  return { src: '', alt: `${hotelName} - property photograph` }
}

/** Gallery for a hotel, database URLs first, catalog shots after. */
export function resolveHotelGallery(
  hotelId: number,
  hotelName: string,
  remoteUrl?: string | null,
): Photograph[] {
  const named = (photo: Photograph): Photograph => ({
    ...photo,
    alt: photo.alt || `${hotelName} - property photograph`,
  })
  const remote = remoteUrl
    ? [{ src: remoteUrl, alt: `${hotelName} - property photograph` }]
    : []
  const set = hotelPhotographs[hotelId]
  return [...remote, ...(set ? set.gallery.map(named) : [])]
}

/**
 * Destination card imagery for the five seeded cities. These carry a
 * city mood rather than a specific property claim, so they borrow the
 * closest-matching photograph already placed with each city's hotel.
 */
export const destinationPhotographs: Record<string, Photograph> = {
  Jaipur: {
    src: img8,
    alt: 'Arched balconies of a warm-toned haveli ringing a courtyard pool with a central fountain',
  },
  Udaipur: {
    src: img4,
    alt: 'A golden filigree bridge crossing still lagoon water in front of a curved hotel facade',
  },
  Goa: {
    src: img7,
    alt: 'Resort pool under tall palms with the Arabian Sea visible beyond',
  },
  Kochi: {
    src: img9,
    alt: 'Grand heritage lobby with marble columns, brass lifts and mosaic murals',
  },
  Manali: {
    src: img2,
    alt: 'Guest room balcony looking out over hillsides at first light',
  },
}

/** Benched asset, kept out of circulation - see IMAGE-INVENTORY.md. */
export const benchedPhotograph: Photograph = { src: img10, alt: '' }
