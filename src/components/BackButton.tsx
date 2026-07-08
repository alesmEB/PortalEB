import { ArrowLeft } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

export function BackButton({ to }: { to: string }) {
  const navigate = useNavigate()

  return (
    <button
      onClick={() => navigate(to)}
      className="mb-3 inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white/90 px-3 py-2 text-sm font-medium text-slate-700 hover:border-eb-blue hover:text-eb-blue"
    >
      <ArrowLeft className="h-4 w-4" />
      Volver
    </button>
  )
}
