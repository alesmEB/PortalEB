import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  OrderEventType,
  UserRole,
  WorkOrderStatus,
  assignTechnician,
  getWorkOrderDetail,
  listAssignableUsers,
  logOrderEvent,
  unassignTechnician,
  updateWorkOrderStatus,
  type GetWorkOrderDetailData,
  type ListAssignableUsersData,
} from '@dataconnect/generated'
import { BackButton } from '../components/BackButton'
import { HasPermission } from '../components/HasPermission'
import { PdfViewer } from '../components/PdfViewer'
import { FRESH } from '../lib/dataConnectOptions'
import { orderLocationLabel } from '../lib/orderCode'
import { workOrderStatusLabel } from '../lib/orderStatus'

type WorkOrder = NonNullable<GetWorkOrderDetailData['workOrder']>
type AssignableUser = ListAssignableUsersData['users'][number]

function isAssignableUser(user: AssignableUser) {
  return (
    user.role === UserRole.TECHNICIAN ||
    user.userPermissions.some((up) => up.permission.key === 'orders:assignable')
  )
}

function TechnicianAssignModal({
  order,
  onClose,
  onSaved,
}: {
  order: WorkOrder
  onClose: () => void
  onSaved: () => void
}) {
  const [users, setUsers] = useState<AssignableUser[] | null>(null)
  const initialIds = useMemo(
    () => new Set(order.assignments.map((a) => a.technicianId)),
    [order],
  )
  const [selected, setSelected] = useState<Set<string>>(initialIds)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    listAssignableUsers(FRESH).then((res) => setUsers(res.data.users.filter(isAssignableUser)))
  }, [])

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const canSubmit = selected.size > 0

  async function handleConfirm() {
    setSubmitting(true)
    try {
      const toAssign = [...selected].filter((id) => !initialIds.has(id))
      const toUnassign = [...initialIds].filter((id) => !selected.has(id))

      for (const technicianId of toAssign) {
        await assignTechnician({ workOrderId: order.id, technicianId })
      }
      for (const technicianId of toUnassign) {
        await unassignTechnician({ workOrderId: order.id, technicianId })
      }
      if (toAssign.length > 0) {
        await logOrderEvent({
          workOrderId: order.id,
          eventType: OrderEventType.TECHNICIANS_ASSIGNED,
          metadata: { technicianIds: toAssign },
        })
      }
      if (toUnassign.length > 0) {
        await logOrderEvent({
          workOrderId: order.id,
          eventType: OrderEventType.TECHNICIAN_UNASSIGNED,
          metadata: { technicianIds: toUnassign },
        })
      }
      await updateWorkOrderStatus({
        id: order.id,
        status: WorkOrderStatus.ASSIGNED,
        quoteAttempts: order.quoteAttempts,
      })
      onSaved()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-4 sm:items-center">
      <div className="w-full max-w-sm rounded-xl bg-white p-4 shadow-xl">
        <h2 className="text-sm font-semibold text-eb-blue-dark">Asignar técnicos</h2>
        <p className="mt-1 text-xs text-slate-500">
          Técnicos y jefes de equipo disponibles para esta orden.
        </p>

        <div className="mt-3 max-h-64 space-y-1 overflow-y-auto">
          {users === null && <p className="text-sm text-slate-500">Cargando...</p>}
          {users?.length === 0 && (
            <p className="text-sm text-slate-500">No hay técnicos asignables.</p>
          )}
          {users?.map((user) => (
            <label
              key={user.id}
              className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700"
            >
              <input
                type="checkbox"
                checked={selected.has(user.id)}
                onChange={() => toggle(user.id)}
              />
              {user.displayName}
              {user.role === UserRole.ADMIN && (
                <span className="ml-auto text-xs text-slate-400">Jefe de equipo</span>
              )}
            </label>
          ))}
        </div>

        <div className="mt-4 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 rounded-lg border border-slate-300 py-2 text-sm text-slate-600"
          >
            Cancelar
          </button>
          <button
            disabled={!canSubmit || submitting}
            onClick={handleConfirm}
            className="flex-1 rounded-lg bg-eb-blue py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {submitting ? 'Guardando...' : 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  )
}

export function OrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [order, setOrder] = useState<WorkOrder | null | undefined>(undefined)
  const [assigning, setAssigning] = useState(false)
  const [busy, setBusy] = useState(false)

  const loadOrder = useCallback(async () => {
    if (!id) return
    const res = await getWorkOrderDetail({ id }, FRESH)
    setOrder(res.data.workOrder)
  }, [id])

  useEffect(() => {
    loadOrder()
  }, [loadOrder])

  async function handleAddQuote() {
    if (!order) return
    setBusy(true)
    try {
      const quoteAttempts = order.quoteAttempts + 1
      await updateWorkOrderStatus({
        id: order.id,
        status: WorkOrderStatus.PENDING_QUOTE,
        quoteAttempts,
      })
      await logOrderEvent({
        workOrderId: order.id,
        eventType: OrderEventType.QUOTE_UPLOADED,
        metadata: { attemptNumber: quoteAttempts },
      })
      await loadOrder()
    } finally {
      setBusy(false)
    }
  }

  async function handleAcceptQuote() {
    if (!order) return
    setBusy(true)
    try {
      await updateWorkOrderStatus({
        id: order.id,
        status: WorkOrderStatus.AWAITING_ASSIGNMENT,
        quoteAttempts: order.quoteAttempts,
      })
      await logOrderEvent({ workOrderId: order.id, eventType: OrderEventType.QUOTE_ACCEPTED })
      await loadOrder()
    } finally {
      setBusy(false)
    }
  }

  if (order === undefined) {
    return (
      <div className="flex-1 p-4">
        <BackButton to="/orders" />
        <p className="text-sm text-slate-500">Cargando...</p>
      </div>
    )
  }

  if (order === null) {
    return (
      <div className="flex-1 p-4">
        <BackButton to="/orders" />
        <p className="text-sm text-slate-500">Orden no encontrada.</p>
      </div>
    )
  }

  return (
    <div className="flex-1 p-4">
      <BackButton to="/orders" />
      <div className="flex items-center justify-between">
        <h1 className="font-mono text-lg font-semibold text-eb-blue-dark">{order.code}</h1>
        <span className="rounded-full bg-eb-teal/10 px-2.5 py-1 text-xs text-eb-teal-dark">
          {workOrderStatusLabel[order.status]}
        </span>
      </div>
      <p className="text-sm text-slate-500">
        {orderLocationLabel[order.locationCode]} · {order.assetLocation}
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        {(order.status === WorkOrderStatus.PENDING_QUOTE ||
          order.status === WorkOrderStatus.QUOTE_REJECTED) && (
          <HasPermission permission="quotes:upload">
            <button
              disabled={busy || order.quoteAttempts >= 2}
              onClick={handleAddQuote}
              className="rounded-lg bg-eb-teal px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              + Añadir presupuesto
            </button>
          </HasPermission>
        )}
        {order.status === WorkOrderStatus.PENDING_QUOTE && (
          <HasPermission permission="quotes:approve">
            <button
              disabled={busy || order.quoteAttempts === 0}
              onClick={handleAcceptQuote}
              className="rounded-lg bg-eb-blue px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              Aceptar presupuesto
            </button>
          </HasPermission>
        )}
        {order.status === WorkOrderStatus.AWAITING_ASSIGNMENT && (
          <button
            onClick={() => setAssigning(true)}
            className="rounded-lg bg-eb-blue-dark px-3 py-1.5 text-sm font-semibold text-white"
          >
            Asignar técnicos
          </button>
        )}
      </div>

      <section className="mt-4 rounded-xl border border-slate-200 bg-white/90 p-4 backdrop-blur-sm">
        <h2 className="text-sm font-semibold text-eb-teal-dark">Cliente</h2>
        <p className="mt-2 text-sm text-slate-700">{order.customer.name}</p>
        <p className="text-sm text-slate-500">
          {order.customer.contactName} · {order.customer.phone}
        </p>
      </section>

      <section className="mt-4 rounded-xl border border-slate-200 bg-white/90 p-4 backdrop-blur-sm">
        <h2 className="text-sm font-semibold text-eb-teal-dark">Embarcación / máquina</h2>
        <p className="mt-2 text-sm text-slate-700">{order.boat.name}</p>
        {order.boat.registrationNumber && (
          <p className="text-sm text-slate-500">Matrícula: {order.boat.registrationNumber}</p>
        )}
        <ul className="mt-2 space-y-1">
          {order.boat.engines.map((engine, i) => (
            <li key={i} className="rounded-lg bg-slate-50 p-2 text-xs text-slate-600">
              {engine.engineType} · chasis {engine.chassisNumber} · propulsor{' '}
              {engine.propellerSerialNumber}
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-4 rounded-xl border border-slate-200 bg-white/90 p-4 backdrop-blur-sm">
        <h2 className="text-sm font-semibold text-eb-teal-dark">Trabajos a realizar</h2>
        <ul className="mt-2 space-y-1">
          {order.tasks.map((task) => (
            <li key={task.id} className="flex items-center gap-2 text-sm text-slate-700">
              <span
                className={`inline-block h-2 w-2 rounded-full ${
                  task.isCompleted ? 'bg-eb-teal' : 'bg-slate-300'
                }`}
              />
              {task.description}
            </li>
          ))}
        </ul>
      </section>

      {order.description && (
        <section className="mt-4 rounded-xl border border-slate-200 bg-white/90 p-4 backdrop-blur-sm">
          <h2 className="text-sm font-semibold text-eb-teal-dark">Comentarios adicionales</h2>
          <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{order.description}</p>
        </section>
      )}

      {order.quotes.length > 0 && (
        <section className="mt-4 rounded-xl border border-slate-200 bg-white/90 p-4 backdrop-blur-sm">
          <h2 className="text-sm font-semibold text-eb-teal-dark">Presupuestos</h2>
          <ul className="mt-2 space-y-1">
            {order.quotes.map((quote, i) => (
              <li key={i} className="text-sm text-slate-700">
                Intento {quote.attemptNumber}: {quote.decision}
                {quote.amount != null ? ` · ${quote.amount} €` : ''}
              </li>
            ))}
          </ul>
        </section>
      )}

      {order.assignments.length > 0 && (
        <section className="mt-4 rounded-xl border border-slate-200 bg-white/90 p-4 backdrop-blur-sm">
          <h2 className="text-sm font-semibold text-eb-teal-dark">Técnicos asignados</h2>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {order.assignments.map((assignment) => (
              <li
                key={assignment.technicianId}
                className="rounded-full bg-eb-teal/10 px-2.5 py-0.5 text-xs text-eb-teal-dark"
              >
                {assignment.technician.displayName}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-4 rounded-xl border border-slate-200 bg-white/90 p-4 backdrop-blur-sm">
        <h2 className="text-sm font-semibold text-eb-teal-dark">Historial</h2>
        <ul className="mt-2 space-y-1">
          {order.tracking.map((event, i) => (
            <li key={i} className="text-xs text-slate-500">
              {new Date(event.occurredAt).toLocaleString('es-ES')} · {event.actor.displayName} ·{' '}
              {event.eventType}
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-4 rounded-xl border border-slate-200 bg-white/90 p-4 backdrop-blur-sm">
        <h2 className="text-sm font-semibold text-eb-teal-dark">Informe PDF</h2>
        {order.finalReportUrl ? (
          <div className="mt-2">
            <PdfViewer url={order.finalReportUrl} />
          </div>
        ) : (
          <p className="mt-2 text-sm text-slate-500">Todavía no hay un informe generado.</p>
        )}
      </section>

      {assigning && (
        <TechnicianAssignModal
          order={order}
          onClose={() => setAssigning(false)}
          onSaved={() => {
            setAssigning(false)
            loadOrder()
          }}
        />
      )}
    </div>
  )
}
