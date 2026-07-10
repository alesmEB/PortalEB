import { Route, Routes } from 'react-router-dom'
import { ActiveShiftBanner } from './components/ActiveShiftBanner'
import { AppBackground } from './components/AppBackground'
import { Footer } from './components/Footer'
import { ProtectedRoute } from './components/ProtectedRoute'
import { AdminPage } from './pages/AdminPage'
import { AssignmentsPage } from './pages/AssignmentsPage'
import { CalendarPage } from './pages/CalendarPage'
import { ChatPage } from './pages/ChatPage'
import { DashboardPage } from './pages/DashboardPage'
import { LoginPage } from './pages/LoginPage'
import { NewOrderPage } from './pages/NewOrderPage'
import { OrdersListPage } from './pages/OrdersListPage'
import { OrderDetailPage } from './pages/OrderDetailPage'
import { SendNotificationPage } from './pages/SendNotificationPage'

function App() {
  return (
    <div className="flex min-h-svh flex-col">
      <AppBackground />

      <div className="flex flex-1 flex-col">
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <DashboardPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/orders/new"
            element={
              <ProtectedRoute>
                <NewOrderPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/orders/:id"
            element={
              <ProtectedRoute>
                <OrderDetailPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/orders"
            element={
              <ProtectedRoute>
                <OrdersListPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/assignments"
            element={
              <ProtectedRoute>
                <AssignmentsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/calendar"
            element={
              <ProtectedRoute>
                <CalendarPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/chat/:kind/:orderId"
            element={
              <ProtectedRoute>
                <ChatPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/notifications/send"
            element={
              <ProtectedRoute>
                <SendNotificationPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin"
            element={
              <ProtectedRoute>
                <AdminPage />
              </ProtectedRoute>
            }
          />
        </Routes>
      </div>

      <ActiveShiftBanner />
      <Footer />
    </div>
  )
}

export default App
