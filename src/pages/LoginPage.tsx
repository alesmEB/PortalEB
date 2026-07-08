import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import logoElias from '../assets/branding/logo-elias.png'
import { useAuth } from '../contexts/AuthContext'

export function LoginPage() {
  const { firebaseUser, loading, signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (!loading && firebaseUser) return <Navigate to="/" replace />

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await signIn(email, password)
    } catch {
      setError('Email o contraseña incorrectos.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-12">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white/90 p-6 shadow-xl backdrop-blur-sm"
      >
        <img src={logoElias} alt="Elías Blanco naval · industrial" className="h-14 w-auto" />
        <p className="mt-3 text-sm text-slate-500">
          Control de órdenes de trabajo del taller
        </p>

        <label className="mt-6 block text-sm font-medium text-eb-blue-dark">
          Email
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base text-slate-900 outline-none focus:border-eb-blue focus:ring-1 focus:ring-eb-blue"
          />
        </label>

        <label className="mt-4 block text-sm font-medium text-eb-blue-dark">
          Contraseña
          <input
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base text-slate-900 outline-none focus:border-eb-blue focus:ring-1 focus:ring-eb-blue"
          />
        </label>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="mt-6 w-full rounded-lg bg-eb-blue py-2.5 text-base font-semibold text-white transition-colors hover:bg-eb-blue-dark disabled:opacity-60"
        >
          {submitting ? 'Entrando...' : 'Entrar'}
        </button>
      </form>
    </div>
  )
}
