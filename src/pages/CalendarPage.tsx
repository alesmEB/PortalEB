import { useEffect, useMemo, useState } from 'react'
import { MapPin, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import {
  OrderLocation,
  UserRole,
  WorkOrderStatus,
  listAssignedWorkOrders,
  listCalendarAppointmentDates,
  listCalendarAppointments,
  listWorkOrderScheduledDates,
  type ListAssignedWorkOrdersData,
  type ListCalendarAppointmentDatesData,
  type ListCalendarAppointmentsData,
  type ListWorkOrderScheduledDatesData,
} from '@dataconnect/generated'
import { BackButton } from '../components/BackButton'
import { useAuth } from '../contexts/AuthContext'
import { usePermission } from '../hooks/usePermission'
import {
  createCalendarAppointment,
  deleteCalendarAppointment,
  setCalendarAppointmentClosed,
  setCalendarAppointmentScheduledDate,
  setWorkOrderScheduledDate,
  updateCalendarAppointment,
  type CalendarAppointmentInput,
} from '../lib/calendar'
import { FRESH } from '../lib/dataConnectOptions'
import { orderLocationLabel } from '../lib/orderCode'
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
type Appointment = ListCalendarAppointmentsData['calendarAppointments'][number]
type AppointmentEntry =
  ListCalendarAppointmentDatesData['calendarAppointmentDates'][number]

function taskProgressLabel(tasks: { isCompleted: boolean }[]) {
  if (tasks.length === 0) return null
  const done = tasks.filter((t) => t.isCompleted).length
  return `${done}/${tasks.length} tareas`
}

/** Small task checklist shown directly on a calendar card/entry - compact
 * enough for the month view's tighter cells, reused as-is in the week view. */
function TaskList({ tasks }: { tasks: { description: string; isCompleted: boolean }[] }) {
  if (tasks.length === 0) return null
  return (
    <ul className="mt-1 space-y-0.5">
      {tasks.map((task, i) => (
        <li
          key={i}
          className={`truncate text-[10px] ${task.isCompleted ? 'text-slate-400 line-through' : 'text-slate-600'}`}
        >
          {task.description}
        </li>
      ))}
    </ul>
  )
}

function dateFromKey(key: string) {
  const [year, month, day] = key.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function isWeekend(date: Date) {
  const day = date.getDay()
  return day === 0 || day === 6
}

export function CalendarPage() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const isLab = usePermission('admin:lab')
  // Clients never see the calendar; technicians can view it but only
  // admins (and lab, as the usual bypass for testing) can edit it.
  const canView = profile?.role === UserRole.ADMIN || profile?.role === UserRole.TECHNICIAN || isLab
  const canManage = profile?.role === UserRole.ADMIN || isLab
  const [assignedOrders, setAssignedOrders] = useState<AssignedOrder[] | null>(null)
  const [scheduledEntries, setScheduledEntries] = useState<ScheduledEntry[] | null>(null)
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [appointmentEntries, setAppointmentEntries] = useState<AppointmentEntry[]>([])
  const [editingAppointment, setEditingAppointment] = useState<Appointment | 'new' | null>(null)
  // Set when the new-appointment dialog was opened by clicking a day in the
  // month view, so the appointment lands on that day instead of unscheduled.
  const [newAppointmentDay, setNewAppointmentDay] = useState<string | null>(null)
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null)
  const [showClosedAppointments, setShowClosedAppointments] = useState(false)
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()))
  const [monthCursor, setMonthCursor] = useState(() => startOfMonth(new Date()))
  const [view, setView] = useState<'week' | 'month'>('week')
  const [savingKey, setSavingKey] = useState<string | null>(null)
  // Hidden by default - the workshop doesn't normally schedule weekend work.
  const [showWeekends, setShowWeekends] = useState(false)

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart])
  const visibleDays = showWeekends ? days : days.filter((d) => !isWeekend(d))
  const monthDays = useMemo(() => monthGridDays(monthCursor), [monthCursor])
  const visibleMonthDays = showWeekends ? monthDays : monthDays.filter((d) => !isWeekend(d))
  const visibleWeekdayLabels = showWeekends ? weekdayLabels : weekdayLabels.slice(0, 5)
  const gridColsClass = showWeekends ? 'lg:grid-cols-7' : 'lg:grid-cols-5'
  const monthGridColsClass = showWeekends ? 'grid-cols-7' : 'grid-cols-5'
  const todayKey = toDateKey(new Date())

  function load() {
    listAssignedWorkOrders(FRESH).then((res) => setAssignedOrders(res.data.workOrders))
    listWorkOrderScheduledDates(FRESH).then((res) =>
      setScheduledEntries(res.data.workOrderScheduledDates),
    )
    listCalendarAppointments(FRESH).then((res) =>
      setAppointments(res.data.calendarAppointments),
    )
    listCalendarAppointmentDates(FRESH).then((res) =>
      setAppointmentEntries(res.data.calendarAppointmentDates),
    )
  }

  useEffect(() => {
    if (canView) load()
  }, [canView])

  const entriesByDate = useMemo(() => {
    const map = new Map<string, ScheduledEntry[]>()
    for (const entry of scheduledEntries ?? []) {
      const list = map.get(entry.date) ?? []
      list.push(entry)
      map.set(entry.date, list)
    }
    return map
  }, [scheduledEntries])

  const appointmentsByDate = useMemo(() => {
    const map = new Map<string, AppointmentEntry[]>()
    for (const entry of appointmentEntries) {
      const list = map.get(entry.date) ?? []
      list.push(entry)
      map.set(entry.date, list)
    }
    return map
  }, [appointmentEntries])

  // Closed appointments stay out of the panel but keep their days on the
  // calendar, same as a completed order's past days.
  const openAppointments = appointments.filter((a) => !a.closedAt)
  const closedAppointments = appointments.filter((a) => a.closedAt)

  async function handleToggleAppointment(
    appointmentId: string,
    dateKey: string,
    scheduled: boolean,
  ) {
    const key = `cita-${appointmentId}-${dateKey}`
    setSavingKey(key)
    try {
      await setCalendarAppointmentScheduledDate(appointmentId, dateKey, scheduled)
      load()
    } finally {
      setSavingKey(null)
    }
  }

  function openNewAppointment(dateKey: string | null) {
    setNewAppointmentDay(dateKey)
    setEditingAppointment('new')
  }

  async function handleCloseAppointment(appointmentId: string, closed: boolean) {
    await setCalendarAppointmentClosed(appointmentId, closed)
    load()
  }

  async function handleDeleteAppointment(appointmentId: string) {
    await deleteCalendarAppointment(appointmentId)
    setConfirmingDeleteId(null)
    load()
  }

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

  if (!canView) {
    return (
      <div className="flex-1 p-4">
        <BackButton to="/" />
        <p className="mt-4 text-sm text-slate-500">No tienes permiso para ver el calendario.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col p-4">
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

      <label className="mt-2 flex w-fit cursor-pointer items-center gap-1.5 text-xs text-slate-500">
        <input
          type="checkbox"
          className="h-3 w-3 rounded border-slate-300"
          checked={showWeekends}
          onChange={(e) => setShowWeekends(e.target.checked)}
        />
        Mostrar fines de semana
      </label>

      {(assignedOrders === null || scheduledEntries === null) && (
        <p className="mt-4 text-sm text-slate-500">Cargando...</p>
      )}

      {assignedOrders !== null && scheduledEntries !== null && view === 'month' && (
        <div className="mt-4 flex flex-1 flex-col">
          <div
            className={`grid ${monthGridColsClass} gap-px overflow-hidden rounded-t-xl border border-slate-200 bg-slate-200 text-center text-[11px] font-semibold text-slate-500`}
          >
            {visibleWeekdayLabels.map((label) => (
              <div key={label} className="bg-white/90 py-1">
                {label}
              </div>
            ))}
          </div>
          {/* flex-1 + equal auto rows: the weeks stretch to fill the screen,
              and a busy day still grows past its share instead of clipping. */}
          <div
            className={`grid flex-1 auto-rows-[1fr] ${monthGridColsClass} gap-px overflow-hidden rounded-b-xl border border-t-0 border-slate-200 bg-slate-200`}
          >
            {visibleMonthDays.map((day) => {
              const key = toDateKey(day)
              const isToday = key === todayKey
              const inMonth = day.getMonth() === monthCursor.getMonth()
              const dayEntries = entriesByDate.get(key) ?? []
              return (
                <div
                  key={key}
                  onClick={canManage ? () => openNewAppointment(key) : undefined}
                  title={canManage ? 'Añadir una cita este día' : undefined}
                  className={`min-h-[80px] bg-white/90 p-1 ${!inMonth ? 'opacity-40' : ''} ${
                    isToday ? 'ring-2 ring-inset ring-eb-blue' : ''
                  } ${canManage ? 'cursor-pointer transition-colors hover:bg-amber-50/70' : ''}`}
                >
                  {canManage ? (
                    // The day number doubles as the keyboard entry point, so the
                    // cell can stay a plain click target without nesting buttons.
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        openNewAppointment(key)
                      }}
                      aria-label={`Añadir una cita el ${formatDayLabel(day)}`}
                      className={`rounded px-0.5 text-[11px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-eb-blue ${
                        isToday ? 'text-eb-blue-dark' : 'text-slate-500'
                      }`}
                    >
                      {day.getDate()}
                    </button>
                  ) : (
                    <p
                      className={`text-[11px] font-semibold ${
                        isToday ? 'text-eb-blue-dark' : 'text-slate-500'
                      }`}
                    >
                      {day.getDate()}
                    </p>
                  )}
                  <div className="mt-1 space-y-1">
                    {dayEntries.map((entry) => {
                      const completed = entry.workOrder.status === WorkOrderStatus.COMPLETED
                      return (
                        <button
                          key={entry.workOrder.id}
                          onClick={(e) => {
                            e.stopPropagation()
                            navigate(`/orders/${entry.workOrder.id}`)
                          }}
                          title={`${entry.workOrder.code} · ${entry.workOrder.customer.name}`}
                          className={`block w-full rounded px-1 py-0.5 text-left text-[9px] ${
                            completed
                              ? 'bg-green-500/15 text-green-800'
                              : workOrderStatusColor[entry.workOrder.status]
                          }`}
                        >
                          <p className="truncate font-semibold">{entry.workOrder.boat.name}</p>
                          <TaskList tasks={entry.workOrder.tasks} />
                          <p className="mt-0.5 flex items-center gap-0.5 opacity-80">
                            <MapPin className="h-2.5 w-2.5 shrink-0" />
                            <span className="truncate">
                              {orderLocationLabel[entry.workOrder.locationCode]}
                              {entry.workOrder.assetLocation && ` · ${entry.workOrder.assetLocation}`}
                            </span>
                          </p>
                        </button>
                      )
                    })}
                    {(appointmentsByDate.get(key) ?? []).map((entry) => (
                      <button
                        type="button"
                        key={entry.appointment.id}
                        onClick={(e) => {
                          e.stopPropagation()
                          const full = appointments.find((a) => a.id === entry.appointment.id)
                          if (canManage && full) setEditingAppointment(full)
                        }}
                        title={`Cita · ${entry.appointment.title}${
                          entry.appointment.boatDetails ? ` · ${entry.appointment.boatDetails}` : ''
                        } · ${orderLocationLabel[entry.appointment.locationCode]}`}
                        className="block w-full rounded border border-dashed border-amber-400 bg-amber-50 px-1 py-0.5 text-left text-[9px] text-amber-900"
                      >
                        {/* Same reading order as an order's chip - boat, then the
                            job, then where - so both kinds scan alike. The boat is
                            optional on an appointment, so the job moves up. */}
                        <p className="truncate font-semibold">
                          {entry.appointment.boatDetails || entry.appointment.title}
                        </p>
                        {entry.appointment.boatDetails && (
                          <p className="truncate">{entry.appointment.title}</p>
                        )}
                        <p className="mt-0.5 flex items-center gap-0.5 opacity-80">
                          <MapPin className="h-2.5 w-2.5 shrink-0" />
                          <span className="truncate">
                            {orderLocationLabel[entry.appointment.locationCode]}
                          </span>
                        </p>
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
          <div className={`mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 ${gridColsClass}`}>
            {visibleDays.map((day) => {
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
                      const completed = order.status === WorkOrderStatus.COMPLETED
                      const editable = !completed
                      const saving = savingKey === `${order.id}-${key}`
                      return (
                        <div
                          key={order.id}
                          className={`rounded-lg border p-2 text-left ${
                            completed ? 'border-green-200 bg-green-500/10' : 'border-slate-200'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-1">
                            <button
                              onClick={() => navigate(`/orders/${order.id}`)}
                              className="flex-1 text-left"
                            >
                              <p className="text-xs font-semibold text-eb-blue-dark">
                                {order.boat.name}
                              </p>
                              <p className="text-xs text-slate-600">
                                {order.customer.name} · <span className="font-mono">{order.code}</span>
                              </p>
                            </button>
                            {canManage && editable && (
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
                          <TaskList tasks={order.tasks} />
                        </div>
                      )
                    })}
                    {(appointmentsByDate.get(key) ?? []).map((entry) => {
                      const appointment = entry.appointment
                      const saving = savingKey === `cita-${appointment.id}-${key}`
                      return (
                        <div
                          key={appointment.id}
                          className="rounded-lg border border-dashed border-amber-400 bg-amber-50 p-2 text-left"
                        >
                          <div className="flex items-start justify-between gap-1">
                            <div className="flex-1">
                              <p className="text-xs font-semibold text-amber-900">
                                {appointment.title}
                              </p>
                              {appointment.boatDetails && (
                                <p className="text-xs text-amber-800">{appointment.boatDetails}</p>
                              )}
                            </div>
                            {canManage && !appointment.closedAt && (
                              <button
                                disabled={saving}
                                onClick={() => handleToggleAppointment(appointment.id, key, false)}
                                title="Quitar este día"
                                className="text-amber-500 hover:text-red-600 disabled:opacity-50"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                          <span className="mt-1 inline-block rounded-full bg-amber-200/70 px-2 py-0.5 text-[10px] text-amber-900">
                            Cita · {orderLocationLabel[appointment.locationCode]}
                          </span>
                          {appointment.notes && (
                            <p className="mt-1 text-[11px] text-amber-800">{appointment.notes}</p>
                          )}
                        </div>
                      )
                    })}
                    {dayEntries.length === 0 && (appointmentsByDate.get(key) ?? []).length === 0 && (
                      <p className="text-xs text-slate-400">Sin órdenes</p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {canManage && (
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
                      {visibleDays.map((day) => {
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
          )}

          {canManage && (
            <div className="mt-4 rounded-xl border border-slate-200 bg-white/90 p-4 backdrop-blur-sm">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-eb-blue-dark">
                    Citas sin orden ({openAppointments.length})
                  </p>
                  <p className="text-xs text-slate-500">
                    Visitas que todavía no tienen orden de trabajo. Se marcan en los días igual que
                    las órdenes.
                  </p>
                </div>
                <button
                  onClick={() => openNewAppointment(null)}
                  className="shrink-0 rounded-lg bg-eb-teal px-3 py-1.5 text-sm font-semibold text-white"
                >
                  + Nueva cita
                </button>
              </div>
              <div className="mt-3 space-y-3">
                {openAppointments.map((appointment) => {
                  const scheduledSet = new Set(appointment.scheduledDates.map((d) => d.date))
                  return (
                    <div
                      key={appointment.id}
                      className="rounded-lg border border-dashed border-amber-400 bg-amber-50/60 p-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <button
                          onClick={() => setEditingAppointment(appointment)}
                          className="flex-1 text-left"
                        >
                          <p className="text-sm font-semibold text-amber-900">{appointment.title}</p>
                          <p className="text-xs text-amber-800">
                            {orderLocationLabel[appointment.locationCode]}
                            {appointment.boatDetails && ` · ${appointment.boatDetails}`}
                          </p>
                          {appointment.notes && (
                            <p className="mt-0.5 text-xs text-amber-700">{appointment.notes}</p>
                          )}
                        </button>
                        <div className="flex shrink-0 items-center gap-2">
                          <button
                            onClick={() => handleCloseAppointment(appointment.id, true)}
                            title="Cerrar la cita - deja de aparecer aquí pero se mantiene en los días"
                            className="rounded-lg border border-amber-400 px-2 py-1 text-xs text-amber-800"
                          >
                            Cerrar
                          </button>
                          <button
                            onClick={() => setConfirmingDeleteId(appointment.id)}
                            title="Eliminar la cita"
                            className="text-slate-400 hover:text-red-600"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      </div>

                      {confirmingDeleteId === appointment.id && (
                        <div className="mt-2 rounded-lg bg-red-50 p-2">
                          <p className="text-xs text-red-700">
                            ¿Eliminar esta cita y los días en los que está marcada?
                          </p>
                          <div className="mt-2 flex gap-2">
                            <button
                              onClick={() => setConfirmingDeleteId(null)}
                              className="flex-1 rounded-lg border border-slate-300 py-1.5 text-xs text-slate-600"
                            >
                              Cancelar
                            </button>
                            <button
                              onClick={() => handleDeleteAppointment(appointment.id)}
                              className="flex-1 rounded-lg bg-red-600 py-1.5 text-xs font-semibold text-white"
                            >
                              Eliminar
                            </button>
                          </div>
                        </div>
                      )}

                      {appointment.scheduledDates.length > 0 && (
                        <p className="mt-1 text-[11px] text-amber-600">
                          Programada: {appointment.scheduledDates.map((d) => d.date).join(', ')}
                        </p>
                      )}
                      <div className="mt-2 flex flex-wrap gap-2">
                        {visibleDays.map((day) => {
                          const dayKey = toDateKey(day)
                          const checked = scheduledSet.has(dayKey)
                          const saving = savingKey === `cita-${appointment.id}-${dayKey}`
                          return (
                            <label
                              key={dayKey}
                              className={`cursor-pointer rounded-full border px-2.5 py-1 text-xs capitalize ${
                                checked
                                  ? 'border-amber-500 bg-amber-500 text-white'
                                  : 'border-amber-300 text-amber-800'
                              } ${saving ? 'opacity-50' : ''}`}
                            >
                              <input
                                type="checkbox"
                                className="hidden"
                                disabled={saving}
                                checked={checked}
                                onChange={(e) =>
                                  handleToggleAppointment(appointment.id, dayKey, e.target.checked)
                                }
                              />
                              {formatDayLabel(day)}
                            </label>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
                {openAppointments.length === 0 && (
                  <p className="text-xs text-slate-400">Ninguna cita pendiente.</p>
                )}
              </div>

              {closedAppointments.length > 0 && (
                <div className="mt-3 border-t border-slate-200 pt-3">
                  <button
                    onClick={() => setShowClosedAppointments((open) => !open)}
                    className="text-xs text-slate-500 underline"
                  >
                    {showClosedAppointments ? 'Ocultar' : 'Ver'} citas cerradas (
                    {closedAppointments.length})
                  </button>
                  {showClosedAppointments && (
                    <ul className="mt-2 space-y-1">
                      {closedAppointments.map((appointment) => (
                        <li
                          key={appointment.id}
                          className="flex items-center justify-between gap-2 text-xs text-slate-500"
                        >
                          <span className="flex-1 truncate">
                            {appointment.title} · {orderLocationLabel[appointment.locationCode]}
                          </span>
                          <button
                            onClick={() => handleCloseAppointment(appointment.id, false)}
                            className="shrink-0 rounded-lg border border-slate-300 px-2 py-1 text-xs text-slate-600"
                          >
                            Reabrir
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {editingAppointment && (
        <AppointmentModal
          appointment={editingAppointment === 'new' ? null : editingAppointment}
          scheduleOn={editingAppointment === 'new' ? newAppointmentDay : null}
          onClose={() => setEditingAppointment(null)}
          onSaved={() => {
            setEditingAppointment(null)
            load()
          }}
        />
      )}
    </div>
  )
}

/** Create/edit dialog for a calendar appointment - the boat is free text
 * because these are visits to boats the system has no record of yet. */
function AppointmentModal({
  appointment,
  scheduleOn,
  onClose,
  onSaved,
}: {
  appointment: Appointment | null
  /** "YYYY-MM-DD" to schedule a new appointment on right after creating it. */
  scheduleOn: string | null
  onClose: () => void
  onSaved: () => void
}) {
  const [title, setTitle] = useState(appointment?.title ?? '')
  const [boatDetails, setBoatDetails] = useState(appointment?.boatDetails ?? '')
  const [locationCode, setLocationCode] = useState<OrderLocation>(
    appointment?.locationCode ?? OrderLocation.ALGECIRAS,
  )
  const [notes, setNotes] = useState(appointment?.notes ?? '')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const inputClass =
    'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-eb-blue'

  async function handleSubmit() {
    setSubmitting(true)
    setError(null)
    try {
      const input: CalendarAppointmentInput = {
        title: title.trim(),
        boatDetails: boatDetails.trim() || undefined,
        locationCode,
        notes: notes.trim() || undefined,
      }
      if (appointment) {
        await updateCalendarAppointment(appointment.id, input)
      } else {
        const { appointmentId } = await createCalendarAppointment(input)
        if (scheduleOn) await setCalendarAppointmentScheduledDate(appointmentId, scheduleOn, true)
      }
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar la cita.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-4 sm:items-center">
      <div className="max-h-[85vh] w-full max-w-sm overflow-y-auto rounded-xl bg-white p-4 shadow-xl">
        <h2 className="text-sm font-semibold text-eb-blue-dark">
          {appointment
            ? 'Editar cita'
            : scheduleOn
              ? `Nueva cita · ${formatDayLabel(dateFromKey(scheduleOn))}`
              : 'Nueva cita'}
        </h2>
        <p className="mt-0.5 text-xs text-slate-500">
          Una visita sin orden de trabajo, del estilo "Mirar problema barco X".
        </p>

        <div className="mt-3 space-y-3">
          <input
            placeholder="Qué hay que hacer"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={inputClass}
          />
          <input
            placeholder="Embarcación / máquina (opcional)"
            value={boatDetails}
            onChange={(e) => setBoatDetails(e.target.value)}
            className={inputClass}
          />
          <label className="block text-xs font-medium text-slate-500">
            Localización
            <select
              value={locationCode}
              onChange={(e) => setLocationCode(e.target.value as OrderLocation)}
              className={`mt-1 ${inputClass}`}
            >
              {Object.values(OrderLocation).map((loc) => (
                <option key={loc} value={loc}>
                  {orderLocationLabel[loc]}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs font-medium text-slate-500">
            Comentarios de la actuación (opcional)
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className={`mt-1 ${inputClass}`}
            />
          </label>
        </div>

        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

        <div className="mt-4 flex gap-2">
          <button
            onClick={onClose}
            disabled={submitting}
            className="flex-1 rounded-lg border border-slate-300 py-2 text-sm text-slate-600 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || !title.trim()}
            className="flex-1 rounded-lg bg-eb-blue py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {submitting ? 'Guardando...' : appointment ? 'Guardar cambios' : 'Crear cita'}
          </button>
        </div>
      </div>
    </div>
  )
}
