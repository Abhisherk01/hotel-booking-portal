/*
 * Amenity icons drawn as inline strokes so no icon font or dependency
 * enters the bundle. Every glyph is 24x24, 1.5px stroke, round joins -
 * the same quiet hand everywhere. Matching is by keyword so any amenity
 * the API starts returning tomorrow still renders (with the fallback
 * mark) instead of breaking the list.
 */

import type { ReactElement } from 'react'
import './AmenityList.css'

const strokes: Record<string, ReactElement> = {
  pool: (
    <>
      <path d="M2.5 9.5c2 0 2-1.7 4-1.7s2 1.7 4 1.7 2-1.7 4-1.7 2 1.7 4 1.7 2-1.7 3-1.7" />
      <path d="M2.5 15.5c2 0 2-1.7 4-1.7s2 1.7 4 1.7 2-1.7 4-1.7 2 1.7 4 1.7 2-1.7 3-1.7" />
    </>
  ),
  cup: (
    <>
      <path d="M5 9h11v5.5A4.5 4.5 0 0 1 11.5 19h-2A4.5 4.5 0 0 1 5 14.5V9Z" />
      <path d="M16 10h1.5a2.5 2.5 0 0 1 0 5H16" />
      <path d="M8.5 6V4M12.5 6V4" />
    </>
  ),
  wifi: (
    <>
      <path d="M4 9.5a12 12 0 0 1 16 0" />
      <path d="M7 13a8 8 0 0 1 10 0" />
      <path d="M10 16.5a3.8 3.8 0 0 1 4 0" />
      <circle cx="12" cy="19.5" r="1" fill="currentColor" stroke="none" />
    </>
  ),
  snowflake: (
    <>
      <path d="M12 3.5v17" />
      <path d="M4.6 7.3l14.8 9.4" />
      <path d="M19.4 7.3L4.6 16.7" />
    </>
  ),
  signpost: (
    <>
      <path d="M12 4v17" />
      <path d="M7 4.5h9.5l2.5 3-2.5 3H7V4.5Z" />
      <path d="M8.5 21h7" />
    </>
  ),
  plane: (
    <>
      <path d="M21 3.5 3.5 10.5l6.5 2.5 2.5 6.5L21 3.5Z" />
      <path d="M10 13l11-9.5" />
    </>
  ),
  umbrella: (
    <>
      <path d="M12 3.5a9 9 0 0 1 9 9H3a9 9 0 0 1 9-9Z" />
      <path d="M12 12.5v6a2 2 0 0 0 4 0" />
    </>
  ),
  boat: (
    <>
      <path d="M3.5 15h17l-2 4.5h-13l-2-4.5Z" />
      <path d="M12 15V4.5" />
      <path d="M12 5c4.2 1.4 6.3 5 6.7 10" />
    </>
  ),
  lotus: (
    <>
      <path d="M12 5c2 2.4 2 6.1 0 8.6-2-2.5-2-6.2 0-8.6Z" />
      <path d="M6.2 8.8c2.4.6 4.3 2.4 5.8 4.8-2.9.5-5.6-.8-5.8-4.8Z" />
      <path d="M17.8 8.8c-2.4.6-4.3 2.4-5.8 4.8 2.9.5 5.6-.8 5.8-4.8Z" />
      <path d="M4 15.5c2 3 4.9 4.5 8 4.5s6-1.5 8-4.5" />
    </>
  ),
  diya: (
    <>
      <path d="M6.5 15h11l-1.8 4.5H8.3L6.5 15Z" />
      <path d="M12 5.5c1.3 1.7 2.2 3 2.2 4.5a2.2 2.2 0 1 1-4.4 0c0-1.5.9-2.8 2.2-4.5Z" />
    </>
  ),
  fish: (
    <>
      <path d="M4 12c2.6-3.8 6.6-5.2 9.8-3.8 2 .9 3.7 2.6 4.7 3.8-1 1.2-2.7 2.9-4.7 3.8-3.2 1.4-7.2 0-9.8-3.8Z" />
      <path d="M4.5 9.5 2.5 12l2 2.5" />
      <circle cx="15.5" cy="11" r="0.9" fill="currentColor" stroke="none" />
    </>
  ),
  bicycle: (
    <>
      <circle cx="6" cy="16.5" r="3.2" />
      <circle cx="18" cy="16.5" r="3.2" />
      <path d="M6 16.5 10 9h4.5" />
      <path d="M14.5 9 18 16.5" />
      <path d="M9.5 9h4" />
    </>
  ),
  shower: (
    <>
      <path d="M12 3.5v3" />
      <path d="M7 8.5a5 5 0 0 1 10 0v1.5H7V8.5Z" />
      <path d="M8 13v2M12 13v3M16 13v2M10 17v2M14 17v2" />
    </>
  ),
  frame: (
    <>
      <path d="M4 5h16v14H4V5Z" />
      <path d="M4 15.5l4.5-4.5 3.5 3 3-2.5 4.5 4" />
      <circle cx="15.5" cy="8.5" r="1" />
    </>
  ),
  mountains: (
    <>
      <path d="M2.5 19 9 7.5l4.2 7.4" />
      <path d="M13.2 19h8.3l-4.2-7.4-2.2 3.4" />
    </>
  ),
  trek: (
    <>
      <path d="M2.5 19 9 8l4.5 8" />
      <path d="M9 8V4h3.5" />
      <path d="M13.5 19h8l-4-7-2.4 3.6" />
    </>
  ),
  flame: (
    <>
      <path d="M12 3.5c1.8 3.2 5.5 5.3 5.5 9A5.5 5.5 0 0 1 6.5 12.5c0-2.3 1.4-4.1 2.4-5.6.6 1.2 1.6 2 2.6 2.3-.9-2.2-.4-4 .5-5.7Z" />
    </>
  ),
  thermometer: (
    <>
      <path d="M10 4.5a2 2 0 0 1 4 0v8.2a4.6 4.6 0 1 1-4 0V4.5Z" />
      <path d="M12 9.5v6" />
    </>
  ),
  sparkle: (
    <>
      <path d="M12 4.5 13.8 10l5.7 1.9-5.7 1.9L12 19.5l-1.8-5.7-5.7-1.9L10.2 10 12 4.5Z" />
    </>
  ),
}

/** Keyword rules, checked in order; first hit wins. */
const rules: Array<[RegExp, string]> = [
  [/pool|jacuzzi/, 'pool'],
  [/lake|cruise|backwater/, 'pool'],
  [/breakfast|cafe|coffee|tea/, 'cup'],
  [/wi-?fi|internet/, 'wifi'],
  [/air conditioning|cooling/, 'snowflake'],
  [/walk|heritage/, 'signpost'],
  [/airport|shuttle/, 'plane'],
  [/beach|terrace|balcony/, 'umbrella'],
  [/boat|yacht/, 'boat'],
  [/spa|wellness|ayurved/, 'lotus'],
  [/aarti|diya|lamp/, 'diya'],
  [/seafood|fish|sea|grill/, 'fish'],
  [/cycle|bicycle/, 'bicycle'],
  [/shower|bath/, 'shower'],
  [/art|gallery|museum/, 'frame'],
  [/trek|hike|trail/, 'trek'],
  [/mountain/, 'mountains'],
  [/fireplace|fire/, 'flame'],
  [/heated|warm/, 'thermometer'],
]

export function AmenityIcon({ amenity }: { amenity: string }) {
  const name = amenity.toLowerCase()
  let key = 'sparkle'
  for (const [pattern, glyph] of rules) {
    if (pattern.test(name)) {
      key = glyph
      break
    }
  }
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {strokes[key]}
    </svg>
  )
}

type AmenityListProps = {
  amenities: string[]
}

/** The one amenity presentation, used on the details page. */
export function AmenityList({ amenities }: AmenityListProps) {
  if (amenities.length === 0) {
    return (
      <p className="amenity-list amenity-list--empty">
        The API does not list amenities for this stay yet.
      </p>
    )
  }
  return (
    <ul className="amenity-list">
      {amenities.map((amenity) => (
        <li key={amenity}>
          <span className="amenity-list__icon">
            <AmenityIcon amenity={amenity} />
          </span>
          <span className="amenity-list__name">{amenity}</span>
        </li>
      ))}
    </ul>
  )
}
