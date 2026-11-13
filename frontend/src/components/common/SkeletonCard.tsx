import './SkeletonCard.css'

/*
 * Grey stand-in shown while real cards are on their way. It mirrors the
 * exact footprint of HotelCard so the grid does not jump when data lands.
 * Lived on the homepage until Milestone C; the collection and destinations
 * pages load with the same rhythm now, so it moved here.
 */
export function SkeletonCard() {
  return (
    <div className="hotel-card-skeleton" aria-hidden="true">
      <div className="hotel-card-skeleton__media" />
      <div className="hotel-card-skeleton__body">
        <div className="hotel-card-skeleton__line hotel-card-skeleton__line--short" />
        <div className="hotel-card-skeleton__line" />
        <div className="hotel-card-skeleton__line hotel-card-skeleton__line--soft" />
      </div>
    </div>
  )
}
