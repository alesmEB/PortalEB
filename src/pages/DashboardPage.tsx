import { useNavigate } from 'react-router-dom'
import logoElias from '../assets/branding/logo-elias.png'
import { HasPermission } from '../components/HasPermission'
import { useAuth } from '../contexts/AuthContext'

const roleLabel: Record<string, string> = {
  ADMIN: 'Administrador',
  CLIENT: 'Cliente',
  TECHNICIAN: 'Técnico',
}

export function DashboardPage() {
  const { profile, permissions, signOut } = useAuth()
  const navigate = useNavigate()

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <img src={logoElias} alt="Elías Blanco naval · industrial" className="h-8 w-auto" />
          <div className="hidden sm:block">
            <p className="text-sm font-semibold text-eb-blue-dark">{profile?.displayName}</p>
            <p className="text-xs text-slate-500">{profile ? roleLabel[profile.role] : ''}</p>
          </div>
        </div>
        <button
          onClick={() => signOut()}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:border-eb-blue hover:text-eb-blue"
        >
          Salir
        </button>
      </header>

      <main className="flex-1 p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <HasPermission
            permission="orders:create"
            fallback={
              <button
                disabled
                className="w-full rounded-lg bg-slate-200 py-3 text-base font-semibold text-slate-400"
              >
                Nueva orden de trabajo (sin permiso)
              </button>
            }
          >
            <button
              onClick={() => navigate('/orders/new')}
              className="w-full rounded-lg bg-eb-teal py-3 text-base font-semibold text-white transition-colors hover:bg-eb-teal-dark"
            >
              Nueva orden de trabajo
            </button>
          </HasPermission>

          <button
            onClick={() => navigate('/orders')}
            className="w-full rounded-lg bg-eb-blue py-3 text-base font-semibold text-white transition-colors hover:bg-eb-blue-dark"
          >
            Lista de órdenes
          </button>

          <HasPermission
            permission="assignments:view"
            fallback={
              <button
                disabled
                className="w-full rounded-lg bg-slate-200 py-3 text-base font-semibold text-slate-400"
              >
                Asignaciones (sin permiso)
              </button>
            }
          >
            <button
              onClick={() => navigate('/assignments')}
              className="w-full rounded-lg bg-eb-teal py-3 text-base font-semibold text-white transition-colors hover:bg-eb-teal-dark"
            >
              Asignaciones
            </button>
          </HasPermission>

          <HasPermission
            permission="admin:manage"
            fallback={
              <button
                disabled
                className="w-full rounded-lg bg-slate-200 py-3 text-base font-semibold text-slate-400"
              >
                Administración (sin permiso)
              </button>
            }
          >
            <button
              onClick={() => navigate('/admin')}
              className="w-full rounded-lg bg-eb-blue-dark py-3 text-base font-semibold text-white transition-colors hover:opacity-90"
            >
              Administración
            </button>
          </HasPermission>
        </div>

        <div className="mt-6 rounded-xl border border-slate-200 bg-white/90 p-4 backdrop-blur-sm">
          <p className="text-sm font-medium text-eb-blue-dark">Permisos concedidos</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {permissions.map((permission) => (
              <li
                key={permission}
                className="rounded-full bg-eb-blue/10 px-2.5 py-1 text-xs text-eb-blue-dark"
              >
                {permission}
              </li>
            ))}
            {permissions.length === 0 && (
              <li className="text-xs text-slate-400">Ninguno</li>
            )}
          </ul>
        </div>
      </main>
    </div>
  )
}
