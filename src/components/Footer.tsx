import { useLocation } from 'react-router-dom'
import logoEb from '../assets/branding/logo-eb.png'
import { ebT, useEbLanguage } from '../lib/ebI18n'

/** On the EB Engineering client page ("Mis productos"), the copyright line
 * follows that page's language picker instead of always being Spanish - see
 * EbLanguageProvider in App.tsx. */
export function Footer() {
  const { pathname } = useLocation()
  const [lang] = useEbLanguage()
  const isEbClientRoute = pathname === '/ebengineering/my-products'
  const rightsText = isEbClientRoute ? ebT(lang, 'allRightsReserved') : 'Todos los derechos reservados.'
  const builtAt = new Date(__APP_BUILD_TIME__).toLocaleString('es-ES', {
    dateStyle: 'short',
    timeStyle: 'short',
  })

  return (
    <footer className="mt-auto flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-t border-slate-200 bg-white/70 px-4 py-4 backdrop-blur-sm">
      <img src={logoEb} alt="EB Engineering" className="h-5 w-auto" />
      <p className="text-xs text-slate-500">
        © {new Date().getFullYear()} EB Engineering. {rightsText}
      </p>
      <span
        className="text-[10px] tabular-nums text-slate-400"
        title={`Versión ${__APP_VERSION__}, compilada el ${builtAt}`}
      >
        v{__APP_VERSION__} · {builtAt}
      </span>
    </footer>
  )
}
