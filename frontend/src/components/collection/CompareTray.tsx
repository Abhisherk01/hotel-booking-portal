import './CompareTray.css'

export interface CompareTrayEntry {
  id: number
  name: string
  city?: string
}

type CompareTrayProps = {
  entries: CompareTrayEntry[]
  /** True once three stays are chosen - the hard ceiling. */
  limitReached: boolean
  /** Comparison needs at least two columns to be worth opening. */
  canCompare: boolean
  onCompare: () => void
  onRemove: (id: number) => void
  onClear: () => void
}

/*
 * The floating strip that collects the stays picked for comparison. It
 * stays out of the way until the first pick, then follows the visitor
 * down the listing so a selection is never lost to scrolling.
 */
export function CompareTray({ entries, limitReached, canCompare, onCompare, onRemove, onClear }: CompareTrayProps) {
  return (
    <div className="compare-tray" role="region" aria-label="Compare selection">
      <div className="compare-tray__inner container">
        <p className="compare-tray__count" aria-live="polite">
          <span className="compare-tray__count-strong">{entries.length} of 3</span> chosen for
          comparison
        </p>

        <ul className="compare-tray__list">
          {entries.map((entry) => (
            <li key={entry.id} className="compare-tray__item">
              <span className="compare-tray__name">
                {entry.name}
                {entry.city ? ` · ${entry.city}` : ''}
              </span>
              <button
                type="button"
                className="compare-tray__remove"
                onClick={() => onRemove(entry.id)}
                aria-label={`Remove ${entry.name} from comparison`}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>

        <div className="compare-tray__actions">
          <button
            type="button"
            className="btn btn--primary compare-tray__compare"
            disabled={!canCompare}
            onClick={onCompare}
          >
            Compare {entries.length >= 2 ? `${entries.length} stays` : 'stays'}
          </button>
          <button type="button" className="compare-tray__clear" onClick={onClear}>
            Clear
          </button>
        </div>
      </div>

      {limitReached && (
        <p className="compare-tray__limit container">
          Three is the maximum for a side-by-side read — remove one to add another.
        </p>
      )}
    </div>
  )
}
