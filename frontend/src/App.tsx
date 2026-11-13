import { Route, Routes } from 'react-router-dom'
import { AppLayout } from './components/layout/AppLayout'
import { HomePage } from './pages/HomePage'
import { CollectionPage } from './pages/CollectionPage'
import { DestinationsPage } from './pages/DestinationsPage'
import { ManageBookingPage } from './pages/ManageBookingPage'
import { StyleguidePage } from './pages/StyleguidePage'
import { NotFoundPage } from './pages/NotFoundPage'

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<HomePage />} />
        <Route path="hotels" element={<CollectionPage />} />
        <Route path="destinations" element={<DestinationsPage />} />
        <Route path="manage-booking" element={<ManageBookingPage />} />
        <Route path="styleguide" element={<StyleguidePage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
