import { useEffect, useMemo, useState } from 'react'
import { Star } from 'lucide-react'
import { BackButton } from '../components/BackButton'
import {
  RATING_LOCATION_LABEL,
  RATING_SERVICE_TYPE_LABEL,
  exportRatingsPdf,
  listServiceRatings,
  type ServiceRating,
} from '../lib/ratings'

type LocationFilter = number | 'ALL'
type ServiceTypeFilter = number | 'ALL'

function Stars({ value }: { value: number }) {
  return (
    <span className="flex items-center gap-0.5" title={`${value} de 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={`h-4 w-4 ${
            n <= value ? 'fill-amber-400 text-amber-400' : 'text-slate-300'
          }`}
        />
      ))}
    </span>
  )
}

export function RatingsPage() {
  const [ratings, setRatings] = useState<ServiceRating[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [locationFilter, setLocationFilter] = useState<LocationFilter>('ALL')
  const [serviceTypeFilter, setServiceTypeFilter] = useState<ServiceTypeFilter>('ALL')
  const [onlyWithComment, setOnlyWithComment] = useState(false)
  const [pdfFrom, setPdfFrom] = useState('')
  const [pdfTo, setPdfTo] = useState('')
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)

  async function handleExportPdf() {
    setExporting(true)
    setExportError(null)
    try {
      const { blob } = await exportRatingsPdf(pdfFrom || null, pdfTo || null)
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `valoraciones${pdfFrom ? `-desde-${pdfFrom}` : ''}${pdfTo ? `-hasta-${pdfTo}` : ''}.pdf`
      link.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'No se pudo generar el PDF.')
    } finally {
      setExporting(false)
    }
  }

  useEffect(() => {
    listServiceRatings()
      .then(setRatings)
      .catch((err) =>
        setError(err instanceof Error ? err.message : 'No se pudieron cargar las valoraciones.'),
      )
  }, [])

  const filtered = useMemo(() => {
    if (!ratings) return null
    return ratings.filter((r) => {
      if (locationFilter !== 'ALL' && r.location !== locationFilter) return false
      if (serviceTypeFilter !== 'ALL' && r.serviceType !== serviceTypeFilter) return false
      if (onlyWithComment && !r.comments.trim()) return false
      return true
    })
  }, [ratings, locationFilter, serviceTypeFilter, onlyWithComment])

  // Scores of 0 are pre-validation leftovers from the tablet app, not a real
  // "zero stars" verdict - they'd drag the average down misleadingly, so the
  // summary is computed over scored submissions only and says so.
  const scored = useMemo(() => (filtered ?? []).filter((r) => r.rating > 0), [filtered])
  const average = scored.length
    ? scored.reduce((sum, r) => sum + r.rating, 0) / scored.length
    : 0
  const distribution = useMemo(() => {
    const counts = new Map<number, number>([[5, 0], [4, 0], [3, 0], [2, 0], [1, 0]])
    for (const r of scored) counts.set(r.rating, (counts.get(r.rating) ?? 0) + 1)
    return counts
  }, [scored])

  return (
    <div className="flex-1 p-4">
      <BackButton to="/" />
      <h1 className="text-lg font-semibold text-eb-blue-dark">Valoraciones del servicio</h1>
      <p className="text-sm text-slate-500">
        Enviadas por los clientes desde las tablets de los talleres.
      </p>

      {error && (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}
      {ratings === null && !error && <p className="mt-4 text-sm text-slate-500">Cargando...</p>}

      {ratings !== null && (
        <>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <div className="flex flex-col items-center justify-center rounded-xl border border-slate-200 bg-white/90 p-4 sm:w-48">
              <p className="font-mono text-4xl font-semibold leading-none text-eb-blue-dark">
                {scored.length ? average.toFixed(2) : '-'}
              </p>
              <div className="mt-2">
                <Stars value={Math.round(average)} />
              </div>
              <p className="mt-2 text-center text-xs text-slate-500">
                {scored.length} valoración{scored.length === 1 ? '' : 'es'} con nota
                {filtered && filtered.length !== scored.length && (
                  <> · {filtered.length - scored.length} sin nota</>
                )}
              </p>
            </div>

            <div className="flex-1 rounded-xl border border-slate-200 bg-white/90 p-4">
              {[5, 4, 3, 2, 1].map((n) => {
                const count = distribution.get(n) ?? 0
                const pct = scored.length ? (count / scored.length) * 100 : 0
                return (
                  <div key={n} className="flex items-center gap-2 py-0.5">
                    <span className="w-3 text-right text-xs text-slate-500">{n}</span>
                    <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-amber-400" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="w-8 text-right font-mono text-xs text-slate-500">{count}</span>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <select
              value={locationFilter}
              onChange={(e) =>
                setLocationFilter(e.target.value === 'ALL' ? 'ALL' : Number(e.target.value))
              }
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 outline-none focus:border-eb-blue"
            >
              <option value="ALL">Todas las ubicaciones</option>
              {Object.entries(RATING_LOCATION_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>

            <select
              value={serviceTypeFilter}
              onChange={(e) =>
                setServiceTypeFilter(e.target.value === 'ALL' ? 'ALL' : Number(e.target.value))
              }
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 outline-none focus:border-eb-blue"
            >
              <option value="ALL">Todos los servicios</option>
              {Object.entries(RATING_SERVICE_TYPE_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>

            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={onlyWithComment}
                onChange={(e) => setOnlyWithComment(e.target.checked)}
              />
              Solo con comentario
            </label>
          </div>

          <div className="mt-3 rounded-xl border border-slate-200 bg-white/90 p-4">
            <p className="text-sm font-semibold text-eb-blue-dark">Informe en PDF</p>
            <p className="text-xs text-slate-500">
              Incluye la media, el desglose y el detalle del periodo elegido. Deja una fecha en
              blanco para no limitar ese extremo.
            </p>
            <div className="mt-2 flex flex-wrap items-end gap-2">
              <label className="text-xs font-medium text-slate-500">
                Desde
                <input
                  type="date"
                  value={pdfFrom}
                  onChange={(e) => setPdfFrom(e.target.value)}
                  className="mt-1 block rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 outline-none focus:border-eb-blue"
                />
              </label>
              <label className="text-xs font-medium text-slate-500">
                Hasta
                <input
                  type="date"
                  value={pdfTo}
                  onChange={(e) => setPdfTo(e.target.value)}
                  className="mt-1 block rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 outline-none focus:border-eb-blue"
                />
              </label>
              <button
                onClick={handleExportPdf}
                disabled={exporting}
                className="rounded-lg bg-eb-blue px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {exporting ? 'Generando...' : 'Descargar PDF'}
              </button>
            </div>
            {exportError && <p className="mt-2 text-sm text-red-600">{exportError}</p>}
          </div>

          {filtered?.length === 0 && (
            <p className="mt-4 text-sm text-slate-500">
              Ninguna valoración coincide con los filtros.
            </p>
          )}

          <div className="mt-3 space-y-2">
            {filtered?.map((r) => (
              <div key={r.id} className="rounded-xl border border-slate-200 bg-white/90 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  {r.rating > 0 ? (
                    <Stars value={r.rating} />
                  ) : (
                    <span className="text-xs text-slate-400">Sin nota</span>
                  )}
                  <p className="text-xs text-slate-400">
                    {new Date(r.date).toLocaleString('es-ES')}
                  </p>
                </div>
                {r.comments.trim() && (
                  <p className="mt-2 text-sm text-slate-700">{r.comments}</p>
                )}
                <p className="mt-1 text-xs text-slate-500">
                  {RATING_LOCATION_LABEL[r.location] ?? 'Ubicación sin registrar'}
                  {' · '}
                  {RATING_SERVICE_TYPE_LABEL[r.serviceType] ?? 'Servicio sin especificar'}
                </p>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
