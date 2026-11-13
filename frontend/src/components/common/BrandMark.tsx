import { Link } from 'react-router-dom'
import './BrandMark.css'

type BrandMarkProps = {
  tone?: 'dark' | 'light'
}

// Typographic lockup rather than an image, so the wordmark stays crisp at
// any size and adapts to the surface it sits on.
export function BrandMark({ tone = 'dark' }: BrandMarkProps) {
  return (
    <Link to="/" className={`brand brand--${tone}`} aria-label="The Aurelia Collection - home">
      <span className="brand__name">Aurelia</span>
      <span className="brand__subline">The Collection</span>
    </Link>
  )
}
