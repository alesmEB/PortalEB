import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  OrderEventType,
  OrderLocation,
  WorkOrderStatus,
  createBoat,
  createCustomer,
  createEngine,
  createWorkOrder,
  createWorkOrderTask,
  getOrderSequence,
  logOrderEvent,
  updateWorkOrderStatus,
  upsertOrderSequence,
} from '@dataconnect/generated'
import logoElias from '../assets/branding/logo-elias.png'
import { HasPermission } from '../components/HasPermission'
import { useAuth } from '../contexts/AuthContext'
import { ensureChatDoc } from '../lib/chat'
import { FRESH } from '../lib/dataConnectOptions'
import { formatOrderCode } from '../lib/orderCode'

const roleLabel: Record<string, string> = {
  ADMIN: 'Administrador',
  CLIENT: 'Cliente',
  TECHNICIAN: 'Técnico',
}

export function DashboardPage() {
  const { profile, permissions, signOut } = useAuth()
  const navigate = useNavigate()
  const [creatingTestOrder, setCreatingTestOrder] = useState(false)

  // Lab-only shortcut for QA: creates a throwaway order and drops straight
  // into technician assignment, skipping the quote step entirely.
  async function handleCreateTestOrder() {
    setCreatingTestOrder(true)
    try {
      const locationCode = OrderLocation.ALGECIRAS
      const stamp = Date.now()

      const customerRes = await createCustomer({
        name: `Cliente lab ${stamp}`,
        contactName: 'Lab',
        phone: '600000000',
      })
      const customerId = customerRes.data.customer_insert.id

      const boatRes = await createBoat({ ownerId: customerId, name: `Barco lab ${stamp}` })
      const boatId = boatRes.data.boat_insert.id

      await createEngine({
        boatId,
        engineType: 'Test',
        chassisNumber: 'LAB-CH',
        propellerSerialNumber: 'LAB-PROP',
      })

      const sequenceRes = await getOrderSequence({ locationCode }, FRESH)
      const sequenceNumber = (sequenceRes.data.orderSequences[0]?.lastNumber ?? 0) + 1
      await upsertOrderSequence({ locationCode, lastNumber: sequenceNumber })
      const code = formatOrderCode(locationCode, sequenceNumber)

      const workOrderRes = await createWorkOrder({
        code,
        locationCode,
        sequenceNumber,
        customerId,
        boatId,
        assetLocation: 'Zona de pruebas',
        description: 'Orden de prueba rápida (lab)',
      })
      const workOrderId = workOrderRes.data.workOrder_insert.id

      await createWorkOrderTask({ workOrderId, description: 'Tarea de prueba' })
      await logOrderEvent({ workOrderId, eventType: OrderEventType.ORDER_CREATED })
      await updateWorkOrderStatus({
        id: workOrderId,
        status: WorkOrderStatus.AWAITING_ASSIGNMENT,
        quoteAttempts: 0,
      })
      await ensureChatDoc('client', workOrderId, [])
      await ensureChatDoc('technicians', workOrderId, [])

      navigate(`/orders/${workOrderId}`, { state: { from: '/', autoAssign: true } })
    } finally {
      setCreatingTestOrder(false)
    }
  }

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
