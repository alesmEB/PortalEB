import { Route, Routes } from 'react-router-dom'
import { AppBackground } from './components/AppBackground'
import { Footer } from './components/Footer'
import { ProtectedRoute } from './components/ProtectedRoute'
import { DashboardPage } from './pages/DashboardPage'
import { LoginPage } from './pages/LoginPage'
import { NewOrderPage } from './pages/NewOrderPage'

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
        </Routes>
      </div>

      <Footer />
    </div>
  )
}

export default App
