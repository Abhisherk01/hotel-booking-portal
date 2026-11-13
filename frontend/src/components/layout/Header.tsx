import { useEffect, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { BrandMark } from '../common/BrandMark'
import './Header.css'

const navLinks = [
  { to: '/', label: 'Discover', end: true },
  { to: '/destinations', label: 'Destinations' },
  { to: '/hotels', label: 'Our Collection' },
]

export function Header() {
  const [menuOpen, setMenuOpen] = useState(false)
  const location = useLocation()

  // A route change must collapse the mobile panel, otherwise the menu
  // stays open over the page the visitor just navigated to.
  useEffect(() => {
    setMenuOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (!menuOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [menuOpen])

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    isActive ? 'header__link is-active' : 'header__link'

  return (
    <header className="header">
      <div className="header__inner container">
        <BrandMark />

        <nav className="header__nav" aria-label="Primary">
          {navLinks.map((link) => (
            <NavLink key={link.to} to={link.to} end={link.end} className={linkClass}>
              {link.label}
            </NavLink>
          ))}
        </nav>

        <div className="header__actions">
          <NavLink to="/manage-booking" className="header__manage">
            Manage Booking
          </NavLink>
          <button
            type="button"
            className="header__menu-toggle"
            aria-expanded={menuOpen}
            aria-controls="mobile-nav"
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? 'Close' : 'Menu'}
          </button>
        </div>
      </div>

      {menuOpen && (
        <nav id="mobile-nav" className="header__mobile" aria-label="Primary, mobile">
          {navLinks.map((link) => (
            <NavLink key={link.to} to={link.to} end={link.end} className={linkClass}>
              {link.label}
            </NavLink>
          ))}
          <NavLink to="/manage-booking" className="header__link">
            Manage Booking
          </NavLink>
        </nav>
      )}
    </header>
  )
}
