import { useEffect, useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import {
  WorkOrderStatus,
  listAssignedWorkOrders,
  listWorkOrderScheduledDates,
  type ListAssignedWorkOrdersData,
  type ListWorkOrderScheduledDatesData,
} from '@dataconnect/generated'
import { BackButton } from '../components/BackButton'
import { usePermission } from '../hooks/usePermission'
import { setWorkOrderScheduledDate } from '../lib/calendar'
import { FRESH } from '../lib/dataConnectOptions'
import { workOrderStatusColor, workOrderStatusLabel } from '../lib/orderStatus'
import {
  addDays,
  addMonths,
  formatDayLabel,
  formatMonthLabel,
  formatWeekRange,
  monthGridDays,
  startOfMonth,
  startOfWeek,
  toDateKey,
} from '../lib/week'

const weekdayLabels = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

type AssignedOrder = ListAssignedWorkOrdersData['workOrders'][number]
type ScheduledEntry = ListWorkOrderScheduledDatesData['workOrderScheduledDates'][number]

function taskProgressLabel(tasks: { isCompleted: boolean }[]) {
  if (tasks.length === 0) return null
  const done = tasks.filter((t) => t.isCompleted).length
  return `${done}/${tasks.length} tareas`
}

export function CalendarPage() {
  const navigate = useNavigate()
  const canManage = usePermission('calendar:manage')
  const [assignedOrders, setAssignedOrders] = useState<AssignedOrder[] | null>(null)
  const [scheduledEntries, setScheduledEntries] = useState<ScheduledEntry[] | null>(null)
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()))
  const [monthCursor, setMonthCursor] = useState(() => startOfMonth(new Date()))
  const [view, setView] = useState<'week' | 'month'>('week')
  const [savingKey, setSavingKey] = useState<string | null>(null)

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart])
  const monthDays = useMemo(() => monthGridDays(monthCursor), [monthCursor])
  const todayKey = toDateKey(new Date())

  function load() {
    listAssignedWorkOrders(FRESH).then((res) => setAssignedOrders(res.data.workOrders))
    listWorkOrderScheduledDates(FRESH).then((res) =>
      setScheduledEntries(res.data.workOrderScheduledDates),
    )
  }

  useEffect(() => {
    if (canManage) load()
  }, [canManage])

  const entriesByDate = useMemo(() => {
    const map = new Map<string, ScheduledEntry[]>()
    for (const entry of scheduledEntries ?? []) {
      const list = map.get(entry.date) ?? []
      list.push(entry)
      map.set(entry.date, list)
    }
    return map
  }, [scheduledEntries])

  async function handleToggle(workOrderId: string, dateKey: string, scheduled: boolean) {
    const key = `${workOrderId}-${dateKey}`
    setSavingKey(key)
    try {
      await setWorkOrderScheduledDate(workOrderId, dateKey, scheduled)
      load()
    } finally {
      setSavingKey(null)
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
          <h1 className="text-lg font-semibold text-eb-blue-dark">
            {view === 'week' ? 'Calendario semanal' : 'Calendario mensual'}
          </h1>
          <p className="text-sm capitalize text-slate-500">
            {view === 'week' ? formatWeekRange(weekStart) : formatMonthLabel(monthCursor)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-slate-300 p-0.5">
            <button
              onClick={() => setView('week')}
              className={`rounded-md px-2.5 py-1 text-sm ${
                view === 'week' ? 'bg-eb-blue text-white' : 'text-slate-600'
              }`}
            >
              Semana
            </button>
            <button
              onClick={() => setView('month')}
              className={`rounded-md px-2.5 py-1 text-sm ${
                view === 'month' ? 'bg-eb-blue text-white' : 'text-slate-600'
              }`}
            >
              Mes
            </button>
          </div>
          {view === 'week' ? (
            <>
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
            </>
          ) : (
            <>
              <button
                onClick={() => setMonthCursor((d) => addMonths(d, -1))}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:border-eb-blue"
              >
                ← Anterior
              </button>
              <button
                onClick={() => setMonthCursor(startOfMonth(new Date()))}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:border-eb-blue"
              >
                Hoy
              </button>
              <button
                onClick={() => setMonthCursor((d) => addMonths(d, 1))}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:border-eb-blue"
              >
                Siguiente →
              </button>
            </>
          )}
        </div>
      </div>

      {(assignedOrders === null || scheduledEntries === null) && (
        <p className="mt-4 text-sm text-slate-500">Cargando...</p>
      )}

      {assignedOrders !== null && scheduledEntries !== null && view === 'month' && (
        <div className="mt-4">
          <div className="grid grid-cols-7 gap-px overflow-hidden rounded-t-xl border border-slate-200 bg-slate-200 text-center text-[11px] font-semibold text-slate-500">
            {weekdayLabels.map((label) => (
              <div key={label} className="bg-white/90 py-1">
                {label}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-px overflow-hidden rounded-b-xl border border-t-0 border-slate-200 bg-slate-200">
            {monthDays.map((day) => {
              const key = toDateKey(day)
              const isToday = key === todayKey
              const inMonth = day.getMonth() === monthCursor.getMonth()
              const dayEntries = entriesByDate.get(key) ?? []
              return (
                <div
                  key={key}
                  className={`min-h-[80px] bg-white/90 p-1 ${!inMonth ? 'opacity-40' : ''} ${
                    isToday ? 'ring-2 ring-inset ring-eb-blue' : ''
                  }`}
                >
                  <p
                    className={`text-[11px] font-semibold ${
                      isToday ? 'text-eb-blue-dark' : 'text-slate-500'
                    }`}
                  >
                    {day.getDate()}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-0.5">
                    {dayEntries.map((entry) => (
                      <button
                        key={entry.workOrder.id}
                        onClick={() => navigate(`/orders/${entry.workOrder.id}`)}
                        title={`${entry.workOrder.code} · ${entry.workOrder.customer.name}`}
                        className={`rounded px-1 py-0.5 font-mono text-[9px] ${workOrderStatusColor[entry.workOrder.status]}`}
                      >
                        {entry.workOrder.code}
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {assignedOrders !== null && scheduledEntries !== null && view === 'week' && (
        <>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-7">
            {days.map((day) => {
              const key = toDateKey(day)
              const isToday = key === todayKey
              const dayEntries = entriesByDate.get(key) ?? []
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
                    {dayEntries.map((entry) => {
                      const order = entry.workOrder
                      const editable = order.status !== WorkOrderStatus.COMPLETED
                      const saving = savingKey === `${order.id}-${key}`
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
                                disabled={saving}
                                onClick={() => handleToggle(order.id, key, false)}
                                title="Quitar este día"
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
                          {taskProgressLabel(order.tasks) && (
                            <p className="mt-1 text-[11px] text-slate-400">
                              {taskProgressLabel(order.tasks)}
                            </p>
                          )}
                        </div>
                      )
                    })}
                    {dayEntries.length === 0 && <p className="text-xs text-slate-400">Sin órdenes</p>}
                  </div>
                </div>
              )
            })}
          </div>

          <div className="mt-6 rounded-xl border border-slate-200 bg-white/90 p-4 backdrop-blur-sm">
            <p className="text-sm font-medium text-eb-blue-dark">
              Órdenes asignadas ({assignedOrders.length})
            </p>
            <p className="text-xs text-slate-500">
              Marca los días de esta semana en los que se va a trabajar cada orden. Puedes marcar
              varios días, incluso en semanas distintas.
            </p>
            <div className="mt-3 space-y-3">
              {assignedOrders.map((order) => {
                const scheduledSet = new Set(order.scheduledDates.map((d) => d.date))
                return (
                  <div key={order.id} className="rounded-lg border border-slate-200 p-2">
                    <div className="flex items-center justify-between gap-2">
                      <button
                        onClick={() => navigate(`/orders/${order.id}`)}
                        className="flex-1 text-left"
                      >
                        <p className="font-mono text-sm font-semibold text-eb-blue-dark">
                          {order.code}
                        </p>
                        <p className="text-xs text-slate-500">
                          {order.customer.name} · {order.boat.name}
                          {taskProgressLabel(order.tasks) && ` · ${taskProgressLabel(order.tasks)}`}
                        </p>
                      </button>
                    </div>
                    {order.scheduledDates.length > 0 && (
                      <p className="mt-1 text-[11px] text-slate-400">
                        Programada: {order.scheduledDates.map((d) => d.date).join(', ')}
                      </p>
                    )}
                    <div className="mt-2 flex flex-wrap gap-2">
                      {days.map((day) => {
                        const dayKey = toDateKey(day)
                        const checked = scheduledSet.has(dayKey)
                        const saving = savingKey === `${order.id}-${dayKey}`
                        return (
                          <label
                            key={dayKey}
                            className={`cursor-pointer rounded-full border px-2.5 py-1 text-xs capitalize ${
                              checked
                                ? 'border-eb-teal bg-eb-teal text-white'
                                : 'border-slate-300 text-slate-600'
                            } ${saving ? 'opacity-50' : ''}`}
                          >
                            <input
                              type="checkbox"
                              className="hidden"
                              disabled={saving}
                              checked={checked}
                              onChange={(e) => handleToggle(order.id, dayKey, e.target.checked)}
                            />
                            {formatDayLabel(day)}
                          </label>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
              {assignedOrders.length === 0 && (
                <p className="text-xs text-slate-400">Ninguna orden con técnicos asignados.</p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
