import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { UserRole, getMyEbClient } from '@dataconnect/generated'
import { HasPermission } from '../components/HasPermission'
import { useAuth } from '../contexts/AuthContext'
import { FRESH } from '../lib/dataConnectOptions'

export function DashboardPage() {
  const { profile, permissions } = useAuth()
  const navigate = useNavigate()
  // Blocks rendering the regular dashboard for CLIENT-role users until we
  // know whether they're an EB Engineering client - if so, they're sent
  // straight to their product list instead of ever seeing this page (see
  // ebT/EbLanguageProvider - "Mis productos" has its own tabs for
  // Noticias/FAQ, so there's nothing else here for them to reach).
  const [checkingEbClient, setCheckingEbClient] = useState(profile?.role === UserRole.CLIENT)

  useEffect(() => {
    if (profile?.role !== UserRole.CLIENT) {
      setCheckingEbClient(false)
      return
    }
    getMyEbClient(FRESH).then((res) => {
      if (res.data.ebClients.length > 0) {
        navigate('/ebengineering/my-products', { replace: true })
        return
      }
      setCheckingEbClient(false)
    })
  }, [profile?.role, navigate])

  if (checkingEbClient) {
    return (
      <div className="flex flex-1 items-center justify-center text-slate-500">Cargando...</div>
    )
  }

  return (
    <div className="flex flex-1 flex-col">
      <main className="flex-1 p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <HasPermission permission="orders:create">
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

          <HasPermission permission="assignments:view">
            <button
              onClick={() => navigate('/assignments')}
              className="w-full rounded-lg bg-eb-teal py-3 text-base font-semibold text-white transition-colors hover:bg-eb-teal-dark"
            >
              Asignaciones
            </button>
          </HasPermission>

          {(profile?.role === UserRole.ADMIN ||
            profile?.role === UserRole.TECHNICIAN ||
            permissions.includes('admin:lab')) && (
            <button
              onClick={() => navigate('/calendar')}
              className="w-full rounded-lg bg-eb-teal py-3 text-base font-semibold text-white transition-colors hover:bg-eb-teal-dark"
            >
              Calendario
            </button>
          )}

          <HasPermission permission="admin:manage">
            <button
              onClick={() => navigate('/admin')}
              className="w-full rounded-lg bg-eb-blue-dark py-3 text-base font-semibold text-white transition-colors hover:opacity-90"
            >
              Administración
            </button>
          </HasPermission>

          <HasPermission permission="admin:lab">
            <button
              onClick={() => navigate('/intervention/new')}
              className="w-full rounded-lg border-2 border-dashed border-eb-blue-dark py-3 text-base font-semibold text-eb-blue-dark transition-colors hover:bg-eb-blue-dark/5"
            >
              Nueva orden de intervención (lab)
            </button>
          </HasPermission>

          <HasPermission permission="admin:lab">
            <button
              onClick={() => navigate('/interventions')}
              className="w-full rounded-lg border-2 border-dashed border-eb-blue-dark py-3 text-base font-semibold text-eb-blue-dark transition-colors hover:bg-eb-blue-dark/5"
            >
              Órdenes de intervención (lab)
            </button>
          </HasPermission>

          {(profile?.role === UserRole.ADMIN || permissions.includes('admin:lab')) && (
            <button
              onClick={() => navigate('/ebengineering')}
              className="w-full rounded-lg bg-eb-blue-dark py-3 text-base font-semibold text-white transition-colors hover:opacity-90"
            >
              EB Engineering
            </button>
          )}

          <HasPermission permission="ratings:view">
            <button
              onClick={() => navigate('/ratings')}
              className="w-full rounded-lg bg-eb-teal py-3 text-base font-semibold text-white transition-colors hover:bg-eb-teal-dark"
            >
              Valoraciones
            </button>
          </HasPermission>

        </div>

        {/* A debugging aid for checking claims after a permission change - it
            means nothing to the rest of the users, so only lab sees it. */}
        <HasPermission permission="admin:lab">
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
            </ul>
          </div>
        </HasPermission>
      </main>
    </div>
  )
}
