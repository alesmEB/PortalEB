import { useAuth } from '../contexts/AuthContext'
import { HasPermission } from '../components/HasPermission'

const roleLabel: Record<string, string> = {
  ADMIN: 'Administrador',
  CLIENT: 'Cliente',
  TECHNICIAN: 'Técnico',
}

export function DashboardPage() {
  const { profile, permissions, signOut } = useAuth()

  return (
    <div className="min-h-svh bg-slate-950 text-slate-100">
      <header className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
        <div>
          <p className="font-semibold">{profile?.displayName}</p>
          <p className="text-xs text-slate-400">
            {profile ? roleLabel[profile.role] : ''}
          </p>
        </div>
        <button
          onClick={() => signOut()}
          className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300"
        >
          Salir
        </button>
      </header>

      <main className="p-4">
        <HasPermission
          permission="orders:create"
          fallback={
            <button
              disabled
              className="w-full rounded-lg bg-slate-800 py-3 text-base font-semibold text-slate-500"
            >
              Nueva orden de trabajo (sin permiso)
            </button>
          }
        >
          <button className="w-full rounded-lg bg-amber-400 py-3 text-base font-semibold text-slate-950">
            Nueva orden de trabajo
          </button>
        </HasPermission>

        <div className="mt-6 rounded-xl border border-slate-800 p-4">
          <p className="text-sm font-medium text-slate-300">Permisos concedidos</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {permissions.map((permission) => (
              <li
                key={permission}
                className="rounded-full bg-slate-800 px-2.5 py-1 text-xs text-slate-300"
              >
                {permission}
              </li>
            ))}
            {permissions.length === 0 && (
              <li className="text-xs text-slate-500">Ninguno</li>
            )}
          </ul>
        </div>
      </main>
    </div>
  )
}
