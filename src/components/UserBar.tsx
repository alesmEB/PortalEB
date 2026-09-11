import { LogOut } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import { UserRole } from '@dataconnect/generated'
import logoEb from '../assets/branding/logo-eb.png'
import logoElias from '../assets/branding/logo-elias.png'
import { useAuth } from '../contexts/AuthContext'
import { ebT, useEbLanguage } from '../lib/ebI18n'
import { roleLabel } from '../lib/userRole'
import { BACK_BUTTON_SLOT_ID } from './backButtonSlot'

/** Shown on every authenticated page: back (filled in by BackButton), the
 * logo, and who's logged in with the way out - so no screen spends a row of
 * its own on any of them. On the EB Engineering client page ("Mis
 * productos") the texts follow that page's language picker and the logo is
 * EB Engineering's, since those are its customers - see EbLanguageProvider
 * in App.tsx. */
export function UserBar() {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [lang] = useEbLanguage()
  if (!profile) return null

  const isEbClientView = pathname === '/ebengineering/my-products' && profile.role === UserRole.CLIENT
  const roleText = isEbClientView ? ebT(lang, 'roleClient') : roleLabel[profile.role]
  const signOutText = isEbClientView ? ebT(lang, 'signOut') : 'Salir'

  return (
    // Equal outer columns keep the logo truly centred whatever the two sides
    // hold. minmax(0, ...) because a plain 1fr won't shrink below its text, so
    // on a phone a long name pushed the logo off-centre instead of truncating.
    <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 border-b border-slate-200 bg-white/90 px-4 py-1.5 backdrop-blur-sm">
      <div id={BACK_BUTTON_SLOT_ID} className="-ml-2 flex min-w-0 justify-start" />

      <button
        onClick={() => navigate('/')}
        aria-label="Ir al inicio"
        className="rounded outline-none focus-visible:ring-2 focus-visible:ring-eb-blue"
      >
        <img
          src={isEbClientView ? logoEb : logoElias}
          alt={isEbClientView ? 'EB Engineering' : 'Elías Blanco naval · industrial'}
          className="h-6 w-auto"
        />
      </button>

      <div className="flex min-w-0 items-center justify-end gap-1.5">
        <span className="truncate text-xs font-medium text-eb-blue-dark">{profile.displayName}</span>
        {/* No room for the role next to the logo on a phone - the name stays. */}
        <span className="hidden shrink-0 text-xs text-slate-400 sm:inline">· {roleText}</span>
        <button
          onClick={() => signOut()}
          title={signOutText}
          aria-label={signOutText}
          className="ml-1 inline-flex shrink-0 items-center gap-1 rounded-md border border-slate-300 px-1.5 py-0.5 text-xs text-slate-600 hover:border-eb-blue hover:text-eb-blue"
        >
          <LogOut className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">{signOutText}</span>
        </button>
      </div>
    </div>
  )
}
