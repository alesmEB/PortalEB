import { useLocation } from 'react-router-dom'
import { UserRole } from '@dataconnect/generated'
import { useAuth } from '../contexts/AuthContext'
import { ebT, useEbLanguage } from '../lib/ebI18n'
import { roleLabel } from '../lib/userRole'

/** Shown on every authenticated page so it's always clear who's logged in.
 * On the EB Engineering client page ("Mis productos"), the role label
 * follows that page's language picker instead of always being Spanish - see
 * EbLanguageProvider in App.tsx. */
export function UserBar() {
  const { profile } = useAuth()
  const { pathname } = useLocation()
  const [lang] = useEbLanguage()
  if (!profile) return null

  const isEbClientRoute = pathname === '/ebengineering/my-products'
  const roleText =
    isEbClientRoute && profile.role === UserRole.CLIENT ? ebT(lang, 'roleClient') : roleLabel[profile.role]

  return (
    <div className="flex items-center justify-end gap-1.5 border-b border-slate-200 bg-white/90 px-4 py-1.5 backdrop-blur-sm">
      <span className="truncate text-xs font-medium text-eb-blue-dark">{profile.displayName}</span>
      <span className="text-xs text-slate-400">· {roleText}</span>
    </div>
  )
}
