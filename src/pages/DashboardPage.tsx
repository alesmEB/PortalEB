import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { OrderLocation, UserRole, getMyEbClient } from '@dataconnect/generated'
import logoElias from '../assets/branding/logo-elias.png'
import { HasPermission } from '../components/HasPermission'
import { useAuth } from '../contexts/AuthContext'
import { FRESH } from '../lib/dataConnectOptions'
import { createWorkOrder } from '../lib/orderCreation'

export function DashboardPage() {
  const { profile, permissions, signOut } = useAuth()
  const navigate = useNavigate()
  const [creatingTestOrder, setCreatingTestOrder] = useState(false)
  const [hasEbClient, setHasEbClient] = useState(false)

  useEffect(() => {
    if (profile?.role !== UserRole.CLIENT) return
    getMyEbClient(FRESH).then((res) => setHasEbClient(res.data.ebClients.length > 0))
  }, [profile?.role])

  // Lab-only shortcut for QA: creates a throwaway order and drops straight
  // into technician assignment, skipping the quote step entirely.
  async function handleCreateTestOrder() {
    setCreatingTestOrder(true)
    try {
      const stamp = Date.now()
      const { workOrderId } = await createWorkOrder({
        locationCode: OrderLocation.ALGECIRAS,
        newCustomer: { name: `Cliente lab ${stamp}`, contactName: 'Lab', phone: '600000000' },
        newBoat: { name: `Barco lab ${stamp}` },
        newEngines: [
          { engineType: 'Test', chassisNumber: 'LAB-CH', propellerSerialNumber: 'LAB-PROP' },
        ],
        assetLocation: 'Zona de pruebas',
        description: 'Orden de prueba rápida (lab)',
        tasks: ['Tarea de prueba'],
        skipQuote: true,
      })

      navigate(`/orders/${workOrderId}`, { state: { from: '/', autoAssign: true } })
    } finally {
      setCreatingTestOrder(false)
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur-sm">
        <img src={logoElias} alt="Elías Blanco naval · industrial" className="h-8 w-auto" />
        <button
          onClick={() => signOut()}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:border-eb-blue hover:text-eb-blue"
        >
          Salir
        </button>
      </header>

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
              onClick={() => navigate('/notifications/send')}
              className="w-full rounded-lg border-2 border-dashed border-eb-blue-dark py-3 text-base font-semibold text-eb-blue-dark transition-colors hover:bg-eb-blue-dark/5"
            >
              Enviar notificación (lab)
            </button>
          </HasPermission>

          <HasPermission permission="admin:lab">
            <button
              disabled={creatingTestOrder}
              onClick={handleCreateTestOrder}
              className="w-full rounded-lg border-2 border-dashed border-eb-blue-dark py-3 text-base font-semibold text-eb-blue-dark transition-colors hover:bg-eb-blue-dark/5 disabled:opacity-50"
            >
              {creatingTestOrder ? 'Creando orden...' : 'Orden de prueba → asignación (lab)'}
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

          {hasEbClient && (
            <button
              onClick={() => navigate('/ebengineering/my-products')}
              className="w-full rounded-lg bg-eb-teal py-3 text-base font-semibold text-white transition-colors hover:bg-eb-teal-dark"
            >
              Mis productos EBcontroller
            </button>
          )}
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
