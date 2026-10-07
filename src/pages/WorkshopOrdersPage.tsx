import { useCallback, useEffect, useMemo, useState } from 'react'
import { Wrench } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import {
  UserRole,
  WorkOrderStatus,
  listWorkshopOrders,
  type ListWorkshopOrdersData,
} from '@dataconnect/generated'
import { BackButton } from '../components/BackButton'
import { useAuth } from '../contexts/AuthContext'
import { FRESH } from '../lib/dataConnectOptions'
import { orderLocationLabel } from '../lib/orderCode'
import { WORKSHOP_LOCATIONS, formatMinutes, formatWorkshopMonth } from '../lib/workshop'

type WorkshopOrder = ListWorkshopOrdersData['workOrders'][number]

function closedMinutes(order: WorkshopOrder) {
  return order.timeLogs.reduce((sum, log) => sum + (log.durationMinutes ?? 0), 0)
}

/**
 * Every month's workshop orders (see WorkOrder.workshopMonth), kept on their
 * own screen so they don't mix with the real orders in the orders list. The
 * current month's three are also at the top of Asignaciones for whoever is
 * clocking in; this is where the past ones are found.
 */
export function WorkshopOrdersPage() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const [orders, setOrders] = useState<WorkshopOrder[] | null>(null)
  const [loadError, setLoadError] = useState(false)
  const canView = !!profile && profile.role !== UserRole.CLIENT

  const load = useCallback(() => {
    setLoadError(false)
    listWorkshopOrders(FRESH)
      .then((res) => setOrders(res.data.workOrders))
      .catch(() => setLoadError(true))
  }, [])

  useEffect(() => {
    if (canView) load()
  }, [canView, load])

  const months = useMemo(() => {
    const byMonth = new Map<string, WorkshopOrder[]>()
    for (const order of orders ?? []) {
      const month = order.workshopMonth ?? ''
      byMonth.set(month, [...(byMonth.get(month) ?? []), order])
    }
    // The query already comes newest month first; within a month, the three
    // locations always in the same order.
    return [...byMonth.entries()].map(([month, monthOrders]) => ({
      month,
      minutes: monthOrders.reduce((sum, order) => sum + closedMinutes(order), 0),
      orders: [...monthOrders].sort(
        (a, b) =>
          WORKSHOP_LOCATIONS.indexOf(a.locationCode) - WORKSHOP_LOCATIONS.indexOf(b.locationCode),
      ),
    }))
  }, [orders])

  if (!canView) {
    return (
      <div className="flex-1 p-4">
        <BackButton to="/" />
        <p className="text-sm text-slate-500">No tienes acceso a las órdenes de taller.</p>
      </div>
    )
  }

  return (
    <div className="flex-1 p-4">
      <BackButton to="/" />
      <h1 className="text-lg font-semibold text-eb-blue-dark">Órdenes de taller</h1>
      <p className="text-sm text-slate-500">
        Las horas de taller de cada mes, una orden por localización.
      </p>

      <div className="mt-4 space-y-5">
        {loadError && (
          <div className="flex items-center justify-between gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
            <span>No se han podido cargar las órdenes de taller.</span>
            <button onClick={load} className="shrink-0 font-semibold underline">
              Reintentar
            </button>
          </div>
        )}
        {orders === null && !loadError && <p className="text-sm text-slate-500">Cargando...</p>}
        {orders?.length === 0 && (
          <p className="text-sm text-slate-500">Todavía no hay ninguna orden de taller.</p>
        )}

        {months.map(({ month, minutes, orders: monthOrders }) => (
          <section key={month}>
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-200 pb-1">
              <h2 className="text-sm font-semibold text-eb-teal-dark">{formatWorkshopMonth(month)}</h2>
              <p className="text-xs tabular-nums text-slate-500">{formatMinutes(minutes)}</p>
            </div>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
              {monthOrders.map((order) => {
                const open = order.status === WorkOrderStatus.IN_PROGRESS
                const technicians = new Set(order.timeLogs.map((log) => log.technicianId)).size
                const workingNow = open ? order.timeLogs.filter((log) => !log.clockOut).length : 0
                return (
                  <button
                    key={order.id}
                    onClick={() => navigate(`/orders/${order.id}`, { state: { from: '/workshop' } })}
                    className="rounded-xl border border-slate-200 bg-white/90 p-3 text-left backdrop-blur-sm transition-colors hover:border-eb-blue"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="flex items-center gap-1.5 text-sm font-semibold text-eb-blue-dark">
                        <Wrench className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                        {orderLocationLabel[order.locationCode]}
                      </p>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                          open ? 'bg-eb-teal/10 text-eb-teal-dark' : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {open ? 'Abierta' : 'Cerrada'}
                      </span>
                    </div>
                    <p className="mt-1 text-lg font-semibold tabular-nums text-slate-700">
                      {formatMinutes(closedMinutes(order))}
                    </p>
                    <p className="text-xs text-slate-500">
                      {order.timeLogs.length} {order.timeLogs.length === 1 ? 'turno' : 'turnos'} ·{' '}
                      {technicians} {technicians === 1 ? 'técnico' : 'técnicos'}
                      {workingNow > 0 && (
                        <span className="font-medium text-eb-teal-dark">
                          {' '}
                          · {workingNow} trabajando ahora
                        </span>
                      )}
                    </p>
                    <p className="mt-1 font-mono text-[11px] text-slate-400">
                      {order.code}
                      {order.externalCode && (
                        <span className="text-slate-600"> · {order.externalCode}</span>
                      )}
                    </p>
                  </button>
                )
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
