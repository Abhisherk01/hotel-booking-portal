import { PagePlaceholder } from '../components/common/PagePlaceholder'

export function ManageBookingPage() {
  return (
    <PagePlaceholder
      eyebrow="Phase 5 · Milestone F"
      title="Manage Booking"
      description="Reservation lookup and cancellation arrive in Milestone F, backed by the booking lookup and cancel endpoints. Not-found lookups will show the same neutral state the API returns."
      items={[
        'Retrieve by booking reference and email address',
        'Cancellation with a confirmation dialog',
        'Confirmed and cancelled states rendered from the API',
      ]}
    />
  )
}
