import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { firebaseUser, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-slate-950 text-slate-300">
        Cargando...
      </div>
    )
  }

  if (!firebaseUser) return <Navigate to="/login" replace />

  return <>{children}</>
}
