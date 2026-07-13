import { useAuth } from '../contexts/AuthContext'
import { roleLabel } from '../lib/userRole'

/** Shown on every authenticated page so it's always clear who's logged in. */
export function UserBar() {
  const { profile } = useAuth()
  if (!profile) return null

  return (
    <div className="flex items-center justify-end gap-1.5 border-b border-slate-200 bg-white/90 px-4 py-1.5 backdrop-blur-sm">
      <span className="truncate text-xs font-medium text-eb-blue-dark">{profile.displayName}</span>
      <span className="text-xs text-slate-400">· {roleLabel[profile.role]}</span>
    </div>
  )
}
