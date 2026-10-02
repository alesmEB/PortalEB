import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { BackButton } from '../components/BackButton'
import { BusyOverlay } from '../components/BusyOverlay'
import { useBusyAction } from '../hooks/useBusyAction'
import { usePermission } from '../hooks/usePermission'
import {
  HOURS_LOG_MAX_DAYS,
  exportTimeLogsPdf,
  listTimeLogs,
  type HoursLogResult,
  type HoursLogShift,
} from '../lib/hoursLog'

const inputClass =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-eb-blue'

function toDateInput(date: Date) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** "YYYY-MM-DD" as local midnight - the office reads days in Spanish time. */
function parseDateInput(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function addDays(date: Date, days: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function dayKeyOf(iso: string) {
  return toDateInput(new Date(iso))
}

function formatMinutes(total: number) {
  const hours = Math.floor(total / 60)
  const minutes = total % 60
  return hours === 0 ? `${minutes} min` : `${hours} h ${String(minutes).padStart(2, '0')} min`
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
}

function formatDayHeading(dayKey: string) {
  const text = parseDateInput(dayKey).toLocaleDateString('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
  // Only the first letter: CSS capitalize would also give "De Marzo".
  return text.charAt(0).toUpperCase() + text.slice(1)
}

function closedMinutes(shifts: HoursLogShift[]) {
  return shifts.reduce((sum, shift) => sum + (shift.durationMinutes ?? 0), 0)
}

/** The text to show, and whether "Reintentar" can help: an unknown order code fails the same way twice. */
function describeError(err: unknown): { text: string; retryable: boolean } {
  if (!(err instanceof Error)) return { text: 'No se ha podido cargar el registro.', retryable: true }
  // Same rule as actionErrorMessage in OrderDetailPage: a callable that never
  // reached the server comes back with its bare code ("internal") as message.
  const code = (err as { code?: unknown }).code
  if (typeof code === 'string' && code.startsWith('functions/') && err.message === code.slice(10)) {
    return {
      text: 'No se ha podido contactar con el servidor. Comprueba la conexión y vuelve a intentarlo.',
      retryable: true,
    }
  }
  return { text: err.message, retryable: code === 'functions/internal' || code === 'functions/unavailable' }
}

function ShiftRow({ shift, onOpenOrder }: { shift: HoursLogShift; onOpenOrder: () => void }) {
  const endsAnotherDay = shift.clockOut && dayKeyOf(shift.clockOut) !== dayKeyOf(shift.clockIn)
  return (
    <li className="flex flex-wrap items-baseline gap-x-2 text-xs">
      <span className="tabular-nums text-slate-700">
        {formatTime(shift.clockIn)} –{' '}
        {shift.clockOut ? (
          <>
            {formatTime(shift.clockOut)}
            {endsAnotherDay && ` del ${new Date(shift.clockOut).toLocaleDateString('es-ES')}`}
          </>
        ) : (
          <span className="font-medium text-eb-teal-dark">en curso</span>
        )}
      </span>
      {shift.durationMinutes != null && (
        <span className="tabular-nums text-slate-400">{formatMinutes(shift.durationMinutes)}</span>
      )}
      <button
        onClick={onOpenOrder}
        title={shift.workOrder.deleted ? 'Orden eliminada' : 'Abrir la orden'}
        className={`font-mono font-semibold hover:underline ${
          shift.workOrder.deleted ? 'text-slate-400 line-through' : 'text-eb-blue'
        }`}
      >
        {shift.workOrder.code}
      </button>
      {shift.workOrder.externalCode && (
        <span className="font-mono text-slate-600" title="Número de orden interno">
          {shift.workOrder.externalCode}
        </span>
      )}
      {shift.workOrder.boatName && (
        <span className="min-w-0 truncate text-slate-500">{shift.workOrder.boatName}</span>
      )}
      {shift.recordedOffline && (
        <span
          className="text-amber-700"
          title="Registrado sin cobertura: la hora viene del móvil del técnico"
        >
          · sin conexión
        </span>
      )}
    </li>
  )
}

function TechnicianChip({
  name,
  shifts,
  onOpenOrder,
}: {
  name: string
  shifts: HoursLogShift[]
  onOpenOrder: (shift: HoursLogShift) => void
}) {
  if (shifts.length === 0) {
    return (
      <div className="flex items-baseline justify-between gap-2 rounded-xl border border-dashed border-slate-300 bg-white/60 px-3 py-2">
        <p className="text-sm text-slate-400">{name}</p>
        <p className="text-xs text-slate-400">Sin turnos</p>
      </div>
    )
  }
  return (
    <div className="rounded-xl border border-slate-200 bg-white/90 p-3 backdrop-blur-sm">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm font-semibold text-eb-blue-dark">{name}</p>
        <p className="text-xs font-medium tabular-nums text-slate-500">
          {formatMinutes(closedMinutes(shifts))}
        </p>
      </div>
      <ul className="mt-2 space-y-1 border-l-2 border-eb-teal/30 pl-2">
        {shifts.map((shift) => (
          <ShiftRow key={shift.id} shift={shift} onOpenOrder={() => onOpenOrder(shift)} />
        ))}
      </ul>
    </div>
  )
}

function technicianOptionsOf(data: HoursLogResult) {
  const options = new Map(data.technicians.map((t) => [t.id, t.displayName]))
  // Someone without orders:assignable who clocked in anyway (an admin
  // testing, say) still has to be findable in the list.
  for (const shift of data.timeLogs) {
    if (!options.has(shift.technicianId)) options.set(shift.technicianId, shift.technicianName)
  }
  return [...options.entries()].map(([id, name]) => ({ id, name }))
}

type Loaded = {
  data: HoursLogResult
  /** Every day of the range asked for, or null when the log is for one order. */
  dayKeys: string[] | null
}

// Filters live in the URL, so coming back from an order (or reloading) lands
// on the same selection instead of today's log.
export function HoursLogPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const canView = usePermission('admin:hourslog')
  const [searchParams, setSearchParams] = useSearchParams()

  const today = toDateInput(new Date())
  const mode = searchParams.get('mode') === 'order' ? 'order' : 'days'
  const from = searchParams.get('from') ?? today
  const to = searchParams.get('to') ?? from
  const orderCode = searchParams.get('order') ?? ''
  const technicianId = searchParams.get('tech') ?? ''

  const [orderInput, setOrderInput] = useState(orderCode)
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<{ text: string; retryable: boolean } | null>(null)
  // Kept across loads: in "Por orden" with no code typed there's no result,
  // and the picker would otherwise lose its names (and hide the one chosen).
  const [knownTechnicians, setKnownTechnicians] = useState<{ id: string; name: string }[]>([])
  const [pdfError, setPdfError] = useState<string | null>(null)
  const { busyLabel, runBusy } = useBusyAction()
  // Dates can change faster than the server answers; only the last request
  // may write its result, or an earlier, slower one could overwrite it.
  const requestRef = useRef(0)

  function updateParams(changes: Record<string, string | null>) {
    const next = new URLSearchParams(searchParams)
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value)
      else next.delete(key)
    }
    setSearchParams(next, { replace: true })
  }

  const rangeProblem = useMemo(() => {
    if (mode !== 'days') return null
    if (!from || !to) return 'Elige las fechas.'
    if (to < from) return 'La fecha final es anterior a la inicial.'
    const days = Math.round((parseDateInput(to).getTime() - parseDateInput(from).getTime()) / 86400000) + 1
    if (days > HOURS_LOG_MAX_DAYS) return `Elige como mucho ${HOURS_LOG_MAX_DAYS} días.`
    return null
  }, [mode, from, to])

  const load = useCallback(async () => {
    const request = ++requestRef.current
    setError(null)
    if (!canView || (mode === 'order' && !orderCode) || (mode === 'days' && rangeProblem)) {
      setLoaded(null)
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      let result: Loaded
      if (mode === 'order') {
        result = { data: await listTimeLogs({ orderCode }), dayKeys: null }
      } else {
        const start = parseDateInput(from)
        const end = addDays(parseDateInput(to), 1)
        const dayKeys: string[] = []
        for (let day = start; day < end; day = addDays(day, 1)) dayKeys.push(toDateInput(day))
        result = {
          data: await listTimeLogs({ from: start.toISOString(), to: end.toISOString() }),
          dayKeys,
        }
      }
      if (request === requestRef.current) {
        setLoaded(result)
        setKnownTechnicians(technicianOptionsOf(result.data))
      }
    } catch (err) {
      if (request === requestRef.current) {
        setLoaded(null)
        setError(describeError(err))
      }
    } finally {
      if (request === requestRef.current) setLoading(false)
    }
  }, [canView, mode, orderCode, from, to, rangeProblem])

  useEffect(() => {
    load()
  }, [load])

  const technicianOptions = knownTechnicians

  const days = useMemo(() => {
    if (!loaded) return []
    const shifts = technicianId
      ? loaded.data.timeLogs.filter((shift) => shift.technicianId === technicianId)
      : loaded.data.timeLogs

    const byDay = new Map<string, Map<string, HoursLogShift[]>>()
    for (const shift of shifts) {
      const day = dayKeyOf(shift.clockIn)
      const byTechnician = byDay.get(day) ?? new Map<string, HoursLogShift[]>()
      const list = byTechnician.get(shift.technicianId) ?? []
      list.push(shift)
      byTechnician.set(shift.technicianId, list)
      byDay.set(day, byTechnician)
    }

    const names = new Map(technicianOptions.map((t) => [t.id, t.name]))
    const dayKeys = loaded.dayKeys ?? [...byDay.keys()].sort()
    return dayKeys.map((dayKey) => {
      const byTechnician = byDay.get(dayKey) ?? new Map<string, HoursLogShift[]>()
      // One order's log is about who worked on it, so the rest of the
      // workshop would only be noise; a day's log lists everyone, so an
      // empty chip is itself the information (who didn't clock in).
      const visibleIds =
        loaded.dayKeys === null
          ? [...byTechnician.keys()]
          : technicianId
            ? [technicianId]
            : [
                ...loaded.data.technicians.map((t) => t.id),
                ...[...byTechnician.keys()].filter(
                  (id) => !loaded.data.technicians.some((t) => t.id === id),
                ),
              ]
      const dayShifts = [...byTechnician.values()].flat()
      const technicians = visibleIds.map((id) => ({
        id,
        name: names.get(id) ?? id,
        shifts: byTechnician.get(id) ?? [],
      }))
      return {
        dayKey,
        shiftCount: dayShifts.length,
        minutes: closedMinutes(dayShifts),
        // Whoever clocked in first, then the empty chips: interleaved, the
        // day's hours were scattered between eight "Sin turnos". The sort is
        // stable, so each group keeps its alphabetical order.
        technicians: technicians.sort(
          (a, b) => Number(b.shifts.length > 0) - Number(a.shifts.length > 0),
        ),
      }
    })
  }, [loaded, technicianId, technicianOptions])

  const totalShifts = days.reduce((sum, day) => sum + day.shiftCount, 0)
  const totalMinutes = days.reduce((sum, day) => sum + day.minutes, 0)

  // Prints exactly what's on screen: the selection in the URL, which is what
  // `loaded` was read with.
  async function downloadPdf() {
    setPdfError(null)
    const technician = technicianOptions.find((t) => t.id === technicianId)
    const slug = (text: string) =>
      text
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
    const name = [
      'registro-horas',
      mode === 'order' ? orderCode : from === to ? from : `${from}-a-${to}`,
      technician ? slug(technician.name) : null,
    ]
      .filter(Boolean)
      .join('-')
    try {
      await runBusy('Generando el PDF...', async () => {
        const blob = await exportTimeLogsPdf({
          ...(mode === 'order' ? { orderCode } : { fromDay: from, toDay: to }),
          ...(technicianId ? { technicianId } : {}),
        })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = `${name}.pdf`
        link.click()
        URL.revokeObjectURL(url)
      })
    } catch (err) {
      setPdfError(describeError(err).text)
    }
  }

  function openOrder(shift: HoursLogShift) {
    navigate(`/orders/${shift.workOrder.id}`, {
      state: { from: `${location.pathname}${location.search}` },
    })
  }

  if (!canView) {
    return (
      <div className="flex-1 p-4">
        <BackButton to="/" />
        <p className="text-sm text-slate-500">No tienes acceso al registro de horas.</p>
      </div>
    )
  }

  return (
    <div className="flex-1 p-4">
      <BackButton to="/" />
      <h1 className="text-lg font-semibold text-eb-blue-dark">Registro de horas</h1>
      <p className="text-sm text-slate-500">Los turnos de cada técnico, día a día.</p>

      <div className="mt-4 space-y-3 rounded-xl border border-slate-200 bg-white/90 p-4 backdrop-blur-sm">
        <div className="flex gap-2">
          {(
            [
              ['days', 'Por días'],
              ['order', 'Por orden'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              onClick={() => updateParams({ mode: value === 'order' ? 'order' : null })}
              className={`rounded-lg border px-3 py-1.5 text-sm ${
                mode === value ? 'border-eb-blue bg-eb-blue text-white' : 'border-slate-300 text-slate-600'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {mode === 'days' ? (
          <div className="flex flex-wrap items-end gap-2">
            <label className="min-w-0 flex-1 basis-36 text-xs font-medium text-slate-500">
              Desde
              <input
                type="date"
                value={from}
                onChange={(e) => {
                  const value = e.target.value
                  // Moving the start past the end drags the end along, so a
                  // single day stays one change away.
                  updateParams({ from: value, to: to < value ? value : to })
                }}
                className={`mt-1 ${inputClass}`}
              />
            </label>
            <label className="min-w-0 flex-1 basis-36 text-xs font-medium text-slate-500">
              Hasta
              <input
                type="date"
                value={to}
                onChange={(e) => updateParams({ to: e.target.value })}
                className={`mt-1 ${inputClass}`}
              />
            </label>
            <button
              onClick={() => updateParams({ from: today, to: today })}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:border-eb-blue hover:text-eb-blue"
            >
              Hoy
            </button>
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              updateParams({ order: orderInput.trim().toUpperCase() || null })
            }}
            className="flex gap-2"
          >
            <input
              placeholder="Código de la orden (p. ej. S-000016)"
              value={orderInput}
              onChange={(e) => setOrderInput(e.target.value)}
              className={`${inputClass} min-w-0 flex-1 font-mono`}
            />
            <button
              type="submit"
              disabled={!orderInput.trim()}
              className="rounded-lg bg-eb-blue px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              Ver
            </button>
          </form>
        )}

        <label className="block text-xs font-medium text-slate-500">
          Técnico
          <select
            value={technicianId}
            onChange={(e) => updateParams({ tech: e.target.value || null })}
            className={`mt-1 ${inputClass}`}
          >
            <option value="">Todos los técnicos</option>
            {technicianOptions.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-4 space-y-5">
        {rangeProblem && <p className="text-sm text-red-600">{rangeProblem}</p>}
        {mode === 'order' && !orderCode && (
          <p className="text-sm text-slate-500">Escribe el código de una orden y pulsa "Ver".</p>
        )}
        {error && (
          <div className="flex items-center justify-between gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
            <span>{error.text}</span>
            {error.retryable && (
              <button onClick={load} className="shrink-0 font-semibold underline">
                Reintentar
              </button>
            )}
          </div>
        )}
        {loading && <p className="text-sm text-slate-500">Cargando...</p>}

        {!loading && loaded && (
          <>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              {loaded.data.order ? (
                <button
                  onClick={() =>
                    navigate(`/orders/${loaded.data.order!.id}`, {
                      state: { from: `${location.pathname}${location.search}` },
                    })
                  }
                  className="font-mono text-sm font-semibold text-eb-blue hover:underline"
                >
                  Orden {loaded.data.order.code}
                  {loaded.data.order.externalCode && (
                    <span className="ml-1.5 font-normal text-slate-600">· {loaded.data.order.externalCode}</span>
                  )}
                </button>
              ) : (
                <span />
              )}
              <div className="flex items-center gap-3">
                <p className="text-sm text-slate-600">
                  {totalShifts} {totalShifts === 1 ? 'turno' : 'turnos'} ·{' '}
                  <span className="font-semibold tabular-nums">{formatMinutes(totalMinutes)}</span>
                </p>
                <button
                  onClick={downloadPdf}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-600 hover:border-eb-blue hover:text-eb-blue"
                >
                  Descargar PDF
                </button>
              </div>
            </div>
            {pdfError && <p className="text-sm text-red-600">{pdfError}</p>}

            {days.length === 0 && (
              <p className="text-sm text-slate-500">
                {loaded.dayKeys === null ? 'Nadie ha fichado en esta orden.' : 'Sin turnos.'}
              </p>
            )}

            {days.map((day) => (
              <section key={day.dayKey}>
                <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-200 pb-1">
                  <h2 className="text-sm font-semibold text-eb-teal-dark">
                    {formatDayHeading(day.dayKey)}
                  </h2>
                  {day.shiftCount > 0 && (
                    <p className="text-xs tabular-nums text-slate-500">
                      {day.shiftCount} {day.shiftCount === 1 ? 'turno' : 'turnos'} ·{' '}
                      {formatMinutes(day.minutes)}
                    </p>
                  )}
                </div>
                {day.shiftCount === 0 ? (
                  <p className="mt-2 text-xs text-slate-400">Sin turnos este día.</p>
                ) : (
                  <div className="mt-2 grid grid-cols-1 items-start gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {day.technicians.map((technician) => (
                      <TechnicianChip
                        key={technician.id}
                        name={technician.name}
                        shifts={technician.shifts}
                        onOpenOrder={openOrder}
                      />
                    ))}
                  </div>
                )}
              </section>
            ))}
          </>
        )}
      </div>
      <BusyOverlay label={busyLabel} />
    </div>
  )
}
