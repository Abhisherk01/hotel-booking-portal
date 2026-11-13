import { Link } from 'react-router-dom'
import { BrandMark } from '../common/BrandMark'
import './Footer.css'

const exploreLinks = [
  { to: '/', label: 'Discover' },
  { to: '/destinations', label: 'Destinations' },
  { to: '/hotels', label: 'Our Collection' },
]

export function Footer() {
  return (
    <footer className="footer">
      <div className="container footer__grid">
        <div className="footer__intro">
          <BrandMark tone="light" />
          <p>
            A small, independently curated set of stays across India - booked
            directly, with no accounts and no hidden steps.
          </p>
        </div>

        <nav className="footer__col" aria-label="Explore">
          <h3 className="footer__heading">Explore</h3>
          <ul>
            {exploreLinks.map((link) => (
              <li key={link.to}>
                <Link to={link.to} className="footer__link">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="footer__col">
          <h3 className="footer__heading">Booking Support</h3>
          <p className="footer__text">
            Retrieve or cancel a reservation with your booking reference and
            the email address you booked with.
          </p>
          <Link to="/manage-booking" className="footer__link">
            Manage a booking
          </Link>
        </div>

        <div className="footer__col">
          <h3 className="footer__heading">Contact</h3>
          <p className="footer__demo-note">Demo property - placeholder details</p>
          <p className="footer__text">concierge@aurelia-collection.example</p>
        </div>
      </div>

      <div className="container footer__baseline">
        <p>
          &copy; 2026 The Aurelia Collection. A portfolio demonstration - no
          real reservations are fulfilled.
        </p>
      </div>
    </footer>
  )
}
