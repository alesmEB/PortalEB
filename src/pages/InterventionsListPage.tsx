import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, SlidersHorizontal } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { OrderLocation, UserRole, listInterventions, type ListInterventionsData } from '@dataconnect/generated'
import { BackButton } from '../components/BackButton'
import { useAuth } from '../contexts/AuthContext'
import { usePermission } from '../hooks/usePermission'
import { FRESH } from '../lib/dataConnectOptions'
import { orderLocationLabel } from '../lib/orderCode'

type LocationFilter = OrderLocation | 'ALL'
type QuoteFilter = 'ALL' | 'QUOTE_FIRST' | 'DIRECT'
type KeysFilter = 'ALL' | 'YES' | 'NO'

export function InterventionsListPage() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const isLab = usePermission('admin:lab')
  const canAccess = profile?.role === UserRole.ADMIN || isLab

  const [interventions, setInterventions] = useState<ListInterventionsData['interventions'] | null>(null)

  const [locationFilter, setLocationFilter] = useState<LocationFilter>('ALL')
  const [quoteFilter, setQuoteFilter] = useState<QuoteFilter>('ALL')
  const [keysFilter, setKeysFilter] = useState<KeysFilter>('ALL')
  const [searchText, setSearchText] = useState('')
  const [filtersOpen, setFiltersOpen] = useState(false)

  const activeFilterCount =
    (locationFilter !== 'ALL' ? 1 : 0) +
    (quoteFilter !== 'ALL' ? 1 : 0) +
    (keysFilter !== 'ALL' ? 1 : 0) +
    (searchText.trim() ? 1 : 0)

  useEffect(() => {
    if (!canAccess) return
    listInterventions(FRESH).then((res) => setInterventions(res.data.interventions))
  }, [canAccess])

  const filtered = useMemo(() => {
    if (!interventions) return null
    const query = searchText.trim().toLowerCase()

    return interventions.filter((item) => {
      if (locationFilter !== 'ALL' && item.locationCode !== locationFilter) return false
      if (quoteFilter === 'QUOTE_FIRST' && !item.wantsQuoteFirst) return false
      if (quoteFilter === 'DIRECT' && item.wantsQuoteFirst) return false
      if (keysFilter === 'YES' && !item.keysLeft) return false
      if (keysFilter === 'NO' && item.keysLeft) return false
      if (query) {
        const haystack =
          `${item.code} ${item.customer.name} ${item.boat.name} ${item.requestedWork}`.toLowerCase()
        if (!haystack.includes(query)) return false
      }
      return true
    })
  }, [interventions, locationFilter, quoteFilter, keysFilter, searchText])

  if (!canAccess) {
    return (
      <div className="flex-1 p-4">
        <BackButton to="/" />
        <p className="mt-4 text-sm text-slate-500">No tienes permiso para ver esta sección.</p>
      </div>
    )
  }

  return (
    <div className="flex-1 p-4">
      <BackButton to="/" />
      <h1 className="text-lg font-semibold text-eb-blue-dark">Órdenes de intervención</h1>

      <div className="mt-4 rounded-xl border border-slate-200 bg-white/90 backdrop-blur-sm">
        <button
          onClick={() => setFiltersOpen((open) => !open)}
          className="flex w-full items-center justify-between p-4"
        >
          <span className="flex items-center gap-2 text-sm font-semibold text-eb-blue-dark">
            <SlidersHorizontal className="h-4 w-4" />
            Filtros
            {activeFilterCount > 0 && (
              <span className="rounded-full bg-eb-blue px-2 py-0.5 text-xs text-white">
                {activeFilterCount}
              </span>
            )}
          </span>
          <ChevronDown
            className={`h-4 w-4 text-slate-500 transition-transform ${filtersOpen ? 'rotate-180' : ''}`}
          />
        </button>

        {filtersOpen && (
          <div className="space-y-3 border-t border-slate-200 p-4">
            <div>
              <p className="text-xs font-medium text-slate-500">Localización</p>
              <div className="mt-1 flex flex-wrap gap-2">
                <button
                  onClick={() => setLocationFilter('ALL')}
                  className={`rounded-lg border px-3 py-1.5 text-sm ${
                    locationFilter === 'ALL'
                      ? 'border-eb-blue bg-eb-blue text-white'
                      : 'border-slate-300 text-slate-600'
                  }`}
                >
                  Todas
                </button>
                {Object.values(OrderLocation).map((loc) => (
                  <button
                    key={loc}
                    onClick={() => setLocationFilter(loc)}
                    className={`rounded-lg border px-3 py-1.5 text-sm ${
                      locationFilter === loc
                        ? 'border-eb-blue bg-eb-blue text-white'
                        : 'border-slate-300 text-slate-600'
                    }`}
                  >
                    {orderLocationLabel[loc]}
                  </button>
                ))}
              </div>
            </div>

            <label className="block text-xs font-medium text-slate-500">
              Presupuesto
              <select
                value={quoteFilter}
                onChange={(e) => setQuoteFilter(e.target.value as QuoteFilter)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 outline-none focus:border-eb-blue"
              >
                <option value="ALL">Todos</option>
                <option value="QUOTE_FIRST">Presupuesto primero</option>
                <option value="DIRECT">Reparación directa</option>
              </select>
            </label>

            <label className="block text-xs font-medium text-slate-500">
              Llaves
              <select
                value={keysFilter}
                onChange={(e) => setKeysFilter(e.target.value as KeysFilter)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 outline-none focus:border-eb-blue"
              >
                <option value="ALL">Todas</option>
                <option value="YES">Sí</option>
                <option value="NO">No</option>
              </select>
            </label>

            <label className="block text-xs font-medium text-slate-500">
              Búsqueda libre
              <input
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="Código, cliente, embarcación, trabajos..."
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 outline-none focus:border-eb-blue"
              />
            </label>
          </div>
        )}
      </div>

      {interventions === null && <p className="mt-4 text-sm text-slate-500">Cargando...</p>}

      {interventions !== null && interventions.length === 0 && (
        <p className="mt-4 text-sm text-slate-500">Todavía no hay órdenes de intervención creadas.</p>
      )}

      {filtered !== null &&
        interventions !== null &&
        interventions.length > 0 &&
        filtered.length === 0 && (
          <p className="mt-4 text-sm text-slate-500">Ninguna orden coincide con los filtros.</p>
        )}

      <div className="mt-4 space-y-2">
        {filtered?.map((item) => (
          <div
            key={item.id}
            className="rounded-xl border border-slate-200 bg-white/90 p-4 backdrop-blur-sm"
          >
            <div className="flex items-center justify-between">
              <p className="font-mono text-sm font-semibold text-eb-blue-dark">{item.code}</p>
              <span className="rounded-full bg-eb-blue/10 px-2.5 py-1 text-xs text-eb-blue-dark">
                {orderLocationLabel[item.locationCode]}
              </span>
            </div>
            <p className="mt-1 text-sm text-slate-700">
              {item.customer.name} · {item.boat.name}
            </p>
            <p className="mt-1 text-xs text-slate-500">{item.requestedWork}</p>

            <div className="mt-2 flex flex-wrap gap-2">
              <span
                className={`rounded-full px-2.5 py-1 text-xs ${
                  item.wantsQuoteFirst ? 'bg-amber-100 text-amber-700' : 'bg-teal-100 text-teal-700'
                }`}
              >
                {item.wantsQuoteFirst ? 'Presupuesto primero' : 'Reparación directa'}
              </span>
              <span
                className={`rounded-full px-2.5 py-1 text-xs ${
                  item.keysLeft ? 'bg-slate-100 text-slate-600' : 'bg-red-100 text-red-700'
                }`}
              >
                Llaves: {item.keysLeft ? 'Sí' : 'No'}
              </span>
            </div>

            <p className="mt-2 text-xs text-slate-400">
              {item.receivedBy.displayName} · {new Date(item.createdAt).toLocaleString('es-ES')}
              {item.expectedDeliveryAt &&
                ` · Entrega prevista: ${new Date(item.expectedDeliveryAt).toLocaleDateString('es-ES')}`}
            </p>

            <a
              href={item.signatureUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-block text-xs font-medium text-eb-blue underline"
            >
              Ver firma
            </a>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() => navigate('/intervention/new')}
        className="mt-6 w-full rounded-lg bg-eb-teal py-3 text-base font-semibold text-white transition-colors hover:bg-eb-teal-dark"
      >
        + Nueva orden de intervención
      </button>
    </div>
  )
}
