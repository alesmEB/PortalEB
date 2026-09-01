import { useEffect, useMemo, useState } from 'react'
import { listEbClientProducts, type ListEbClientProductsData } from '@dataconnect/generated'
import { CountryFlag } from '../../components/CountryFlag'
import { FRESH } from '../../lib/dataConnectOptions'

type ProductRow = ListEbClientProductsData['ebClientProducts'][number]

interface CountrySales {
  country: string
  units: number
  share: number
}

// Distinct enough to tell apart as adjacent slices; the list below repeats the
// same colour next to each country so the chart doesn't need its own legend.
const SLICE_COLORS = [
  '#0d9488',
  '#2563eb',
  '#f59e0b',
  '#dc2626',
  '#7c3aed',
  '#0891b2',
  '#65a30d',
  '#db2777',
  '#ea580c',
]
const OTHERS_COLOR = '#94a3b8'
/** Countries past this many go into a single "Otros" slice - the pie stops
 *  being readable well before the list does, so the list still shows them all. */
const MAX_SLICES = SLICE_COLORS.length

function colorForRank(index: number) {
  return index < MAX_SLICES ? SLICE_COLORS[index] : OTHERS_COLOR
}

/** Pie slice from `start` to `end`, both as fractions of the whole (0-1). */
function slicePath(start: number, end: number, cx: number, cy: number, r: number) {
  const angle = (fraction: number) => (fraction * 2 - 0.5) * Math.PI
  const x1 = cx + r * Math.cos(angle(start))
  const y1 = cy + r * Math.sin(angle(start))
  const x2 = cx + r * Math.cos(angle(end))
  const y2 = cy + r * Math.sin(angle(end))
  const largeArc = end - start > 0.5 ? 1 : 0
  return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`
}

function SalesPie({ slices }: { slices: CountrySales[] }) {
  const cx = 100
  const cy = 100
  const r = 95

  // A single country covers the whole circle, and an arc whose start and end
  // land on the same point draws nothing - so it gets a plain circle instead.
  if (slices.length === 1) {
    return (
      <svg viewBox="0 0 200 200" className="h-56 w-56" role="img" aria-label="Distribución de ventas">
        <circle cx={cx} cy={cy} r={r} fill={SLICE_COLORS[0]} />
      </svg>
    )
  }

  let cursor = 0
  return (
    <svg viewBox="0 0 200 200" className="h-56 w-56" role="img" aria-label="Distribución de ventas">
      {slices.map((slice, i) => {
        const start = cursor
        cursor += slice.share
        return (
          <path
            key={slice.country}
            d={slicePath(start, cursor, cx, cy, r)}
            fill={colorForRank(i)}
            stroke="white"
            strokeWidth={1}
          >
            <title>
              {slice.country}: {slice.units} ({Math.round(slice.share * 100)}%)
            </title>
          </path>
        )
      })}
    </svg>
  )
}

export function EbSalesRankingTab() {
  const [products, setProducts] = useState<ProductRow[] | null>(null)

  useEffect(() => {
    listEbClientProducts(FRESH).then((res) => setProducts(res.data.ebClientProducts))
  }, [])

  // Internal-use units are left out, same as the units-sold count on the
  // EBcontroller tab - they aren't sales. Retired units stay in: the unit was
  // sold even if it's since been decommissioned.
  const ranking = useMemo<CountrySales[]>(() => {
    const sales = (products ?? []).filter((p) => !p.internalUse)
    const byCountry = new Map<string, number>()
    for (const sale of sales) {
      byCountry.set(sale.client.country, (byCountry.get(sale.client.country) ?? 0) + 1)
    }
    return [...byCountry.entries()]
      .map(([country, units]) => ({ country, units, share: units / sales.length }))
      .sort((a, b) => b.units - a.units || a.country.localeCompare(b.country, 'es'))
  }, [products])

  const totalUnits = ranking.reduce((sum, row) => sum + row.units, 0)

  // Everything past MAX_SLICES collapses into one "Otros" wedge so the pie
  // stays readable; the list underneath still names every country.
  const slices = useMemo<CountrySales[]>(() => {
    if (ranking.length <= MAX_SLICES) return ranking
    const shown = ranking.slice(0, MAX_SLICES)
    const rest = ranking.slice(MAX_SLICES)
    return [
      ...shown,
      {
        country: `Otros (${rest.length} países)`,
        units: rest.reduce((sum, row) => sum + row.units, 0),
        share: rest.reduce((sum, row) => sum + row.share, 0),
      },
    ]
  }, [ranking])

  if (products === null) return <p className="text-sm text-slate-500">Cargando...</p>

  if (totalUnits === 0) {
    return <p className="text-sm text-slate-500">Todavía no hay ventas registradas.</p>
  }

  return (
    <div>
      <p className="text-sm text-slate-500">
        {totalUnits} unidades vendidas en {ranking.length}{' '}
        {ranking.length === 1 ? 'país' : 'países'}
      </p>

      <div className="mt-3 flex flex-col items-center gap-4 rounded-xl border border-slate-200 bg-white/90 p-4 backdrop-blur-sm sm:flex-row sm:items-start sm:gap-6">
        <div className="shrink-0">
          <SalesPie slices={slices} />
        </div>

        <ol className="w-full space-y-1">
          {ranking.map((row, i) => (
            <li
              key={row.country}
              className="flex items-center gap-2 border-b border-slate-100 py-1.5 last:border-b-0"
            >
              <span className="w-6 shrink-0 text-right text-xs font-semibold text-slate-400">
                {i + 1}
              </span>
              <span
                className="h-3 w-3 shrink-0 rounded-sm"
                style={{ backgroundColor: colorForRank(i) }}
              />
              <CountryFlag country={row.country} />
              <span className="flex-1 truncate text-sm text-slate-700">{row.country}</span>
              <span className="shrink-0 text-sm font-semibold tabular-nums text-eb-blue-dark">
                {row.units}
              </span>
              <span className="w-12 shrink-0 text-right text-xs tabular-nums text-slate-400">
                {Math.round(row.share * 100)}%
              </span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  )
}
