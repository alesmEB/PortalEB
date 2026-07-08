import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { firebaseUser, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center text-slate-500">
        Cargando...
      </div>
    )
  }

  if (!firebaseUser) return <Navigate to="/login" replace />

  return <>{children}</>
}
