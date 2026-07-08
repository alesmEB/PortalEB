import logoEb from '../assets/branding/logo-eb.png'

export function Footer() {
  return (
    <footer className="mt-auto flex items-center justify-center gap-3 border-t border-slate-200 bg-white/70 px-4 py-4 backdrop-blur-sm">
      <img src={logoEb} alt="EB Engineering" className="h-5 w-auto" />
      <p className="text-xs text-slate-500">
        © {new Date().getFullYear()} EB Engineering. Todos los derechos reservados.
      </p>
    </footer>
  )
}
