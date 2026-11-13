import { useState } from 'react'

type SmartImageProps = {
  src: string
  alt: string
  className?: string
  /** Above-the-fold imagery opts out of lazy loading explicitly. */
  eager?: boolean
}

// Every photograph on the site flows through this component so a missing
// or broken asset degrades to a branded placeholder instead of a broken
// image icon.
export function SmartImage({ src, alt, className, eager = false }: SmartImageProps) {
  const [failed, setFailed] = useState(false)

  if (failed) {
    return (
      <div className={`smart-image-fallback ${className ?? ''}`} role="img" aria-label={alt}>
        <span className="smart-image-fallback__mark">Aurelia</span>
      </div>
    )
  }

  return (
    <img
      className={className}
      src={src}
      alt={alt}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      onError={() => setFailed(true)}
    />
  )
}
