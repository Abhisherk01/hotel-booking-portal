import { Link } from 'react-router-dom'
import './PagePlaceholder.css'

type PagePlaceholderProps = {
  eyebrow: string
  title: string
  description: string
  items: string[]
}

// Milestone A ships the shell only; pages that arrive in later milestones
// render this honest "under construction" card rather than fake UI.
export function PagePlaceholder({ eyebrow, title, description, items }: PagePlaceholderProps) {
  return (
    <section className="placeholder container">
      <p className="eyebrow">{eyebrow}</p>
      <h1 className="placeholder__title">{title}</h1>
      <p className="placeholder__lede">{description}</p>
      <ul className="placeholder__list">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <Link to="/styleguide" className="btn btn--ghost placeholder__cta">
        View the design system
      </Link>
    </section>
  )
}
