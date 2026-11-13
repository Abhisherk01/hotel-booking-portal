import { allPhotographs, heroPhotograph, editorialPhotograph } from '../data/imageCatalog'
import { SmartImage } from '../components/common/SmartImage'
import './Styleguide.css'

const palette = [
  { name: 'Warm Ivory', hex: '#FAF8F3', border: true },
  { name: 'Soft Cream', hex: '#F2EEE5', border: true },
  { name: 'Pure White', hex: '#FFFFFF', border: true },
  { name: 'Champagne Gold', hex: '#C5A46D' },
  { name: 'Muted Gold', hex: '#A98B58' },
  { name: 'Deep Charcoal', hex: '#252522' },
  { name: 'Soft Charcoal', hex: '#44443F' },
  { name: 'Warm Grey', hex: '#77756F' },
  { name: 'Light Border', hex: '#E8E3D9', border: true },
  { name: 'Dark Background', hex: '#20201D' },
  { name: 'Success', hex: '#477A5B' },
  { name: 'Warning', hex: '#B78642' },
  { name: 'Error', hex: '#B64C43' },
  { name: 'Information', hex: '#53758B' },
]

const typeSpecimens = [
  { label: 'Hero heading · 48-64px', className: 'spec--hero', text: 'Find Your Place in the Extraordinary.' },
  { label: 'Page heading · 36-44px', className: 'spec--page', text: 'The Aurelia Collection' },
  { label: 'Section heading · 26-32px', className: 'spec--section', text: 'Featured properties' },
  { label: 'Card title · 18-22px', className: 'spec--card', text: 'Hawa Mahal Courtyard Haveli' },
  { label: 'Body · 14-16px', className: 'spec--body', text: 'A restored 1930s haveli five minutes from the Pink City bazaars, with jali-screened verandas and a rooftop facing the Aravalli ridge.' },
  { label: 'Supporting · 12-14px', className: 'spec--small', text: 'Jaipur, Rajasthan · from ₹8,500 per night' },
]

const radii = [
  { label: 'sm · 6px', className: 'radius--sm' },
  { label: 'md · 10px', className: 'radius--md' },
  { label: 'lg · 16px', className: 'radius--lg' },
  { label: 'xl · 24px', className: 'radius--xl' },
]

export function StyleguidePage() {
  return (
    <div className="styleguide container">
      <p className="eyebrow">Phase 5 · Milestone A</p>
      <h1 className="styleguide__title">Design System</h1>
      <p className="styleguide__lede">
        The tokens below are the single source of truth for every component in
        the application. Reference implementation, not a marketing page.
      </p>

      <section className="styleguide__block">
        <h2 className="styleguide__section-title">Colour</h2>
        <div className="swatch-grid">
          {palette.map((swatch) => (
            <figure key={swatch.hex} className="swatch">
              <div
                className="swatch__chip"
                style={{
                  background: swatch.hex,
                  boxShadow: swatch.border ? 'inset 0 0 0 1px var(--color-border)' : undefined,
                }}
              />
              <figcaption className="swatch__label">
                <span>{swatch.name}</span>
                <span className="swatch__hex">{swatch.hex}</span>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      <section className="styleguide__block">
        <h2 className="styleguide__section-title">Typography</h2>
        <div className="specimen-list">
          {typeSpecimens.map((spec) => (
            <div key={spec.label} className="specimen">
              <p className="specimen__label">{spec.label}</p>
              <p className={`specimen__sample ${spec.className}`}>{spec.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="styleguide__block">
        <h2 className="styleguide__section-title">Buttons</h2>
        <div className="styleguide__row">
          <button type="button" className="btn btn--primary">Primary action</button>
          <button type="button" className="btn btn--ghost">Ghost action</button>
          <button type="button" className="btn btn--primary" disabled>Disabled</button>
        </div>
      </section>

      <section className="styleguide__block">
        <h2 className="styleguide__section-title">Radii and elevation</h2>
        <div className="styleguide__row">
          {radii.map((radius) => (
            <div key={radius.label} className={`radius-tile ${radius.className}`}>
              {radius.label}
            </div>
          ))}
        </div>
        <div className="styleguide__row">
          <div className="elevation-tile elevation-tile--card">shadow-card</div>
          <div className="elevation-tile elevation-tile--hover">shadow-hover</div>
        </div>
      </section>

      <section className="styleguide__block">
        <h2 className="styleguide__section-title">Photography inventory</h2>
        <p className="styleguide__note">
          Ten shipped assets with their roles. The hero and editorial images
          are collection-level; hotel pairings are documented in
          <code> docs/IMAGE-INVENTORY.md</code>.
        </p>
        <div className="photo-grid">
          <figure className="photo-tile photo-tile--wide">
            <SmartImage src={heroPhotograph.src} alt={heroPhotograph.alt} className="photo-tile__img" />
            <figcaption>img-6 · homepage hero · infinity pool over the sea</figcaption>
          </figure>
          <figure className="photo-tile photo-tile--wide">
            <SmartImage src={editorialPhotograph.src} alt={editorialPhotograph.alt} className="photo-tile__img" />
            <figcaption>img-3 · editorial block · golden-hour terrace</figcaption>
          </figure>
          {allPhotographs.map((photo, index) => (
            <figure key={photo.src} className="photo-tile">
              <SmartImage src={photo.src} alt={photo.alt} className="photo-tile__img" />
              <figcaption>img-{index + 1} · inventory asset</figcaption>
            </figure>
          ))}
        </div>
      </section>
    </div>
  )
}
