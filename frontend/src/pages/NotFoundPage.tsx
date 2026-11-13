import { Link } from 'react-router-dom'
import './NotFound.css'

export function NotFoundPage() {
  return (
    <section className="not-found container">
      <p className="eyebrow">404</p>
      <h1 className="not-found__title">Page not found</h1>
      <p className="not-found__lede">
        The page you were looking for does not exist or has moved.
      </p>
      <Link to="/" className="btn btn--ghost not-found__cta">
        Return to the collection
      </Link>
    </section>
  )
}
