import { useEffect, useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import {
  WorkOrderStatus,
  listSchedulableWorkOrders,
  type ListSchedulableWorkOrdersData,
} from '@dataconnect/generated'
import { BackButton } from '../components/BackButton'
import { usePermission } from '../hooks/usePermission'
import { scheduleWorkOrder } from '../lib/calendar'
import { FRESH } from '../lib/dataConnectOptions'
import { workOrderStatusColor, workOrderStatusLabel } from '../lib/orderStatus'
import { addDays, formatDayLabel, formatWeekRange, startOfWeek, toDateKey } from '../lib/week'

type OrderRow = ListSchedulableWorkOrdersData['workOrders'][number]

export function CalendarPage() {
  const navigate = useNavigate()
  const canManage = usePermission('calendar:manage')
  const [orders, setOrders] = useState<OrderRow[] | null>(null)
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()))
  const [savingId, setSavingId] = useState<string | null>(null)

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart])
  const todayKey = toDateKey(new Date())

  function load() {
    listSchedulableWorkOrders(FRESH).then((res) => setOrders(res.data.workOrders))
  }

  useEffect(() => {
    if (canManage) load()
  }, [canManage])

  const unscheduled = useMemo(() => orders?.filter((o) => !o.scheduledDate) ?? [], [orders])

  const byDate = useMemo(() => {
    const map = new Map<string, OrderRow[]>()
    for (const order of orders ?? []) {
      if (!order.scheduledDate) continue
      const list = map.get(order.scheduledDate) ?? []
      list.push(order)
      map.set(order.scheduledDate, list)
    }
    return map
  }, [orders])

  async function handleSchedule(orderId: string, dateKey: string | null) {
    setSavingId(orderId)
    try {
      await scheduleWorkOrder(orderId, dateKey)
      load()
    } finally {
      setSavingId(null)
    }
  }

  if (!canManage) {
    return (
      <div className="flex-1 p-4">
        <BackButton to="/" />
        <p className="mt-4 text-sm text-slate-500">No tienes permiso para ver el calendario.</p>
      </div>
    )
  }

  return (
    <div className="flex-1 p-4">
      <BackButton to="/" />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold text-eb-blue-dark">Calendario semanal</h1>
          <p className="text-sm text-slate-500">{formatWeekRange(weekStart)}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setWeekStart((d) => addDays(d, -7))}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:border-eb-blue"
          >
            ← Anterior
          </button>
          <button
            onClick={() => setWeekStart(startOfWeek(new Date()))}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:border-eb-blue"
          >
            Hoy
          </button>
          <button
            onClick={() => setWeekStart((d) => addDays(d, 7))}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:border-eb-blue"
          >
            Siguiente →
          </button>
        </div>
      </div>

      {orders === null && <p className="mt-4 text-sm text-slate-500">Cargando...</p>}

      {orders !== null && (
        <>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-7">
            {days.map((day) => {
              const key = toDateKey(day)
              const isToday = key === todayKey
              const dayOrders = byDate.get(key) ?? []
              return (
                <div
                  key={key}
                  className={`rounded-xl border p-2 backdrop-blur-sm ${
                    isToday ? 'border-eb-blue bg-eb-blue/5' : 'border-slate-200 bg-white/90'
                  }`}
                >
                  <p
                    className={`text-xs font-semibold capitalize ${
                      isToday ? 'text-eb-blue-dark' : 'text-slate-500'
                    }`}
                  >
                    {formatDayLabel(day)}
                  </p>
                  <div className="mt-2 space-y-2">
                    {dayOrders.map((order) => {
                      const editable = order.status !== WorkOrderStatus.COMPLETED
                      return (
                        <div
                          key={order.id}
                          className="rounded-lg border border-slate-200 p-2 text-left"
                        >
                          <div className="flex items-start justify-between gap-1">
                            <button
                              onClick={() => navigate(`/orders/${order.id}`)}
                              className="flex-1 text-left"
                            >
                              <p className="font-mono text-xs font-semibold text-eb-blue-dark">
                                {order.code}
                              </p>
                              <p className="text-xs text-slate-600">
                                {order.customer.name} · {order.boat.name}
                              </p>
                            </button>
                            {editable && (
                              <button
                                disabled={savingId === order.id}
                                onClick={() => handleSchedule(order.id, null)}
                                title="Quitar del calendario"
                                className="text-slate-400 hover:text-red-600 disabled:opacity-50"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                          <span
                            className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] ${workOrderStatusColor[order.status]}`}
                          >
                            {workOrderStatusLabel[order.status]}
                          </span>
                          {order.assignments.length > 0 && (
                            <p className="mt-1 text-[11px] text-slate-500">
                              {order.assignments.map((a) => a.technician.displayName).join(', ')}
                            </p>
                          )}
                          {editable && (
                            <select
                              disabled={savingId === order.id}
                              value={key}
                              onChange={(e) => handleSchedule(order.id, e.target.value)}
                              className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1 text-[11px] text-slate-700"
                            >
                              {days.map((d) => (
                                <option key={toDateKey(d)} value={toDateKey(d)}>
                                  {formatDayLabel(d)}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>
                      )
                    })}
                    {dayOrders.length === 0 && <p className="text-xs text-slate-400">Sin órdenes</p>}
                  </div>
                </div>
              )
            })}
          </div>

          <div className="mt-6 rounded-xl border border-slate-200 bg-white/90 p-4 backdrop-blur-sm">
            <p className="text-sm font-medium text-eb-blue-dark">
              Sin programar ({unscheduled.length})
            </p>
            <p className="text-xs text-slate-500">
              Órdenes con técnicos asignados que todavía no tienen un día asignado.
            </p>
            <div className="mt-3 space-y-2">
              {unscheduled.map((order) => (
                <div
                  key={order.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 p-2"
                >
                  <button onClick={() => navigate(`/orders/${order.id}`)} className="flex-1 text-left">
                    <p className="font-mono text-sm font-semibold text-eb-blue-dark">{order.code}</p>
                    <p className="text-xs text-slate-500">
                      {order.customer.name} · {order.boat.name}
                    </p>
                  </button>
                  <select
                    disabled={savingId === order.id}
                    value=""
                    onChange={(e) => handleSchedule(order.id, e.target.value)}
                    className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs text-slate-700"
                  >
                    <option value="" disabled>
                      Asignar día
                    </option>
                    {days.map((day) => (
                      <option key={toDateKey(day)} value={toDateKey(day)}>
                        {formatDayLabel(day)}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
              {unscheduled.length === 0 && <p className="text-xs text-slate-400">Ninguna</p>}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
