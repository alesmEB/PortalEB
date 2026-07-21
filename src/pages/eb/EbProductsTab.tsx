import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  listEbCableTypes,
  listEbClientProducts,
  listEbClients,
  type ListEbCableTypesData,
  type ListEbClientProductsData,
  type ListEbClientsData,
} from '@dataconnect/generated'
import { SearchInput } from '../../components/SearchInput'
import { countryFlag } from '../../lib/countryFlag'
import { FRESH } from '../../lib/dataConnectOptions'
import {
  ebAddClientProduct,
  ebCreateCableType,
  ebDeleteClientProduct,
  ebSetClientProductRetired,
  ebUpdateClientProduct,
} from '../../lib/ebEngineering'
import { EbCableChecksTab } from './EbCableChecksTab'

type ProductRow = ListEbClientProductsData['ebClientProducts'][number]
type ClientRow = ListEbClientsData['ebClients'][number]
type CableType = ListEbCableTypesData['ebCableTypes'][number]

const inputClass =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-eb-blue'

function todayDateString() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function CableTypePicker({
  cableTypes,
  selected,
  onToggle,
  onCreated,
}: {
  cableTypes: CableType[]
  selected: Set<string>
  onToggle: (id: string) => void
  onCreated: () => void
}) {
  const [addingType, setAddingType] = useState(false)
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleCreate() {
    setSubmitting(true)
    try {
      await ebCreateCableType(code.trim(), name.trim())
      setCode('')
      setName('')
      setAddingType(false)
      onCreated()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div>
      <p className="text-xs font-medium text-slate-500">Cables incluidos</p>
      <div className="mt-1 flex flex-wrap gap-2">
        {cableTypes.map((cable) => (
          <label
            key={cable.id}
            className={`cursor-pointer rounded-full border px-2.5 py-1 text-xs ${
              selected.has(cable.id)
                ? 'border-eb-blue bg-eb-blue text-white'
                : 'border-slate-300 text-slate-600'
            }`}
          >
            <input
              type="checkbox"
              className="hidden"
              checked={selected.has(cable.id)}
              onChange={() => onToggle(cable.id)}
            />
            {cable.name} ({cable.code})
          </label>
        ))}
        <button
          type="button"
          onClick={() => setAddingType((v) => !v)}
          className="rounded-full border border-dashed border-slate-300 px-2.5 py-1 text-xs text-eb-blue"
        >
          {addingType ? 'Cancelar' : '+ Nuevo tipo'}
        </button>
      </div>
      {addingType && (
        <div className="mt-2 flex flex-wrap gap-2">
          <input
            placeholder="Código (p.ej. EBEN180100)"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className={`${inputClass} flex-1 basis-32`}
          />
          <input
            placeholder="Nombre"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={`${inputClass} flex-1 basis-32`}
          />
          <button
            disabled={!code.trim() || !name.trim() || submitting}
            onClick={handleCreate}
            className="rounded-lg bg-eb-teal px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            Crear
          </button>
        </div>
      )}
    </div>
  )
}

function ProductForm({
  product,
  clients,
  cableTypes,
  onSaved,
  onCancel,
  onCableTypesChanged,
}: {
  product?: ProductRow
  clients: ClientRow[]
  cableTypes: CableType[]
  onSaved: () => void
  onCancel: () => void
  onCableTypesChanged: () => void
}) {
  const [clientId, setClientId] = useState(product?.client.id ?? '')
  const [serialNumber, setSerialNumber] = useState(product?.serialNumber ?? '')
  const [hardwareNumber, setHardwareNumber] = useState(product?.hardwareNumber ?? '')
  const [purchasedAt, setPurchasedAt] = useState(product?.purchasedAt ?? '')
  const [observations, setObservations] = useState(product?.observations ?? '')
  const [selectedCables, setSelectedCables] = useState<Set<string>>(
    new Set(product?.cables.map((c) => c.cableType.id) ?? []),
  )
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canSubmit = clientId && serialNumber.trim() && hardwareNumber.trim()

  function toggleCable(id: string) {
    setSelectedCables((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleSubmit() {
    setSubmitting(true)
    setError(null)
    try {
      const input = {
        clientId,
        serialNumber: serialNumber.trim(),
        hardwareNumber: hardwareNumber.trim(),
        purchasedAt: purchasedAt || undefined,
        observations: observations.trim() || undefined,
        programFileUrl: product?.programFileUrl ?? undefined,
        soldToEndUserAt: product?.soldToEndUserAt ?? undefined,
        cableTypeIds: [...selectedCables],
      }
      if (product) {
        await ebUpdateClientProduct({ productId: product.id, ...input })
      } else {
        await ebAddClientProduct(input)
      }
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mt-3 space-y-3 border-t border-slate-200 pt-3 first:mt-0 first:border-t-0 first:pt-0">
      <label className="block text-xs font-medium text-slate-500">
        Cliente
        <select
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          className={`mt-1 ${inputClass}`}
        >
          <option value="">Selecciona un cliente</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.companyName} ({c.country})
            </option>
          ))}
        </select>
      </label>
      <input
        placeholder="Número de serie"
        value={serialNumber}
        onChange={(e) => setSerialNumber(e.target.value)}
        className={inputClass}
      />
      <input
        placeholder="Número de hardware"
        value={hardwareNumber}
        onChange={(e) => setHardwareNumber(e.target.value)}
        className={inputClass}
      />
      <label className="block text-xs font-medium text-slate-500">
        Fecha de compra (opcional)
        <input
          type="date"
          value={purchasedAt}
          onChange={(e) => setPurchasedAt(e.target.value)}
          className={`mt-1 ${inputClass}`}
        />
      </label>
      <CableTypePicker
        cableTypes={cableTypes}
        selected={selectedCables}
        onToggle={toggleCable}
        onCreated={onCableTypesChanged}
      />
      <label className="block text-xs font-medium text-slate-500">
        Observaciones (opcional)
        <textarea
          value={observations}
          onChange={(e) => setObservations(e.target.value)}
          rows={3}
          className={`mt-1 ${inputClass}`}
        />
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button
          onClick={onCancel}
          className="flex-1 rounded-lg border border-slate-300 py-2 text-sm text-slate-600"
        >
          Cancelar
        </button>
        <button
          disabled={!canSubmit || submitting}
          onClick={handleSubmit}
          className="flex-1 rounded-lg bg-eb-blue py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {submitting ? 'Guardando...' : product ? 'Guardar cambios' : 'Registrar venta'}
        </button>
      </div>
    </div>
  )
}

// Shown only for a product currently owned by a client who is itself a
// distributor for others (see EbClient.distributorId) - lets the admin
// repoint clientId at one of that distributor's already-created end clients
// when they report reselling the unit, without touching anything else on
// the record (serial/hardware/purchasedAt/cables/observations all resent
// unchanged - see ebUpdateClientProduct).
function TransferToEndClientPanel({
  product,
  downstreamClients,
  onCancel,
  onTransferred,
}: {
  product: ProductRow
  downstreamClients: ClientRow[]
  onCancel: () => void
  onTransferred: () => void
}) {
  const [endClientId, setEndClientId] = useState('')
  const [soldToEndUserAt, setSoldToEndUserAt] = useState(todayDateString())
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleConfirm() {
    if (!endClientId) return
    setSubmitting(true)
    setError(null)
    try {
      await ebUpdateClientProduct({
        productId: product.id,
        clientId: endClientId,
        serialNumber: product.serialNumber,
        hardwareNumber: product.hardwareNumber,
        purchasedAt: product.purchasedAt ?? undefined,
        observations: product.observations ?? undefined,
        programFileUrl: product.programFileUrl ?? undefined,
        soldToEndUserAt: soldToEndUserAt || undefined,
        cableTypeIds: product.cables.map((c) => c.cableType.id),
      })
      onTransferred()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo transferir la venta.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mt-3 rounded-lg border border-eb-teal/30 bg-eb-teal/5 p-3">
      <p className="text-xs text-slate-600">
        Este cliente es distribuidor. Elige a cuál de sus clientes finales le ha revendido esta unidad -
        el resto de datos (serie, hardware, fecha de venta, cables) se conserva.
      </p>
      <select
        value={endClientId}
        onChange={(e) => setEndClientId(e.target.value)}
        className={`mt-2 ${inputClass}`}
      >
        <option value="">Selecciona un cliente final</option>
        {downstreamClients.map((c) => (
          <option key={c.id} value={c.id}>
            {c.companyName} ({c.country})
          </option>
        ))}
      </select>
      <label className="mt-2 block text-xs font-medium text-slate-500">
        Fecha de venta al cliente final
        <input
          type="date"
          value={soldToEndUserAt}
          onChange={(e) => setSoldToEndUserAt(e.target.value)}
          className={`mt-1 ${inputClass}`}
        />
      </label>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      <div className="mt-2 flex gap-2">
        <button
          onClick={onCancel}
          className="flex-1 rounded-lg border border-slate-300 py-1.5 text-sm text-slate-600"
        >
          Cancelar
        </button>
        <button
          disabled={!endClientId || submitting}
          onClick={handleConfirm}
          className="flex-1 rounded-lg bg-eb-teal py-1.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {submitting ? 'Transfiriendo...' : 'Confirmar venta'}
        </button>
      </div>
    </div>
  )
}

function ProductTypeTabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg border px-3 py-2 text-sm ${
        active ? 'border-eb-blue bg-eb-blue text-white' : 'border-slate-300 text-slate-600'
      }`}
    >
      {children}
    </button>
  )
}

type ProductType = 'controller' | 'cables'

// Second-level menu under "Productos": which kind of product to view - more
// may be added later, kept separate (not one big page) so each stays simple.
export function EbProductsTab() {
  const [productType, setProductType] = useState<ProductType>('controller')

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <ProductTypeTabButton active={productType === 'controller'} onClick={() => setProductType('controller')}>
          EBcontroller
        </ProductTypeTabButton>
        <ProductTypeTabButton active={productType === 'cables'} onClick={() => setProductType('cables')}>
          Cables
        </ProductTypeTabButton>
      </div>

      <div className="mt-4">
        {productType === 'controller' && <EbControllerProductsTab />}
        {productType === 'cables' && <EbCableChecksTab />}
      </div>
    </div>
  )
}

function EbControllerProductsTab() {
  const [products, setProducts] = useState<ProductRow[] | null>(null)
  const [clients, setClients] = useState<ClientRow[]>([])
  const [cableTypes, setCableTypes] = useState<CableType[]>([])
  const [creating, setCreating] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null)
  const [retiringId, setRetiringId] = useState<string | null>(null)
  const [transferringId, setTransferringId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [countryFilter, setCountryFilter] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')

  async function refresh() {
    const [productsRes, clientsRes, cablesRes] = await Promise.all([
      listEbClientProducts(FRESH),
      listEbClients(FRESH),
      listEbCableTypes(FRESH),
    ])
    setProducts(productsRes.data.ebClientProducts)
    setClients(clientsRes.data.ebClients)
    setCableTypes(cablesRes.data.ebCableTypes)
  }

  function refreshCableTypes() {
    listEbCableTypes(FRESH).then((res) => setCableTypes(res.data.ebCableTypes))
  }

  useEffect(() => {
    refresh()
  }, [])

  async function handleToggleRetired(product: ProductRow) {
    setRetiringId(product.id)
    try {
      await ebSetClientProductRetired(product.id, !product.retiredAt)
      await refresh()
    } finally {
      setRetiringId(null)
    }
  }

  const countries = useMemo(
    () => [...new Set(clients.map((c) => c.country))].sort(),
    [clients],
  )

  // Clients grouped by their distributor (see EbClient.distributorId) - lets
  // a product currently owned by a distributor offer "sell to end client",
  // limited to that distributor's already-created downstream clients.
  const downstreamClientsByDealerId = useMemo(() => {
    const map = new Map<string, ClientRow[]>()
    for (const client of clients) {
      if (!client.distributorId) continue
      const list = map.get(client.distributorId) ?? []
      list.push(client)
      map.set(client.distributorId, list)
    }
    return map
  }, [clients])

  // Global "número de EBcontroller" and per-country sale order, both oldest
  // first - computed from the full, unfiltered list so the numbers stay
  // stable regardless of the search/country/date filters below. Units
  // without a purchasedAt fall back to createdAt for ordering purposes only.
  const ranksByProductId = useMemo(() => {
    const map = new Map<string, { globalRank: number; countryRank: number }>()
    if (!products) return map
    const effectiveDate = (p: ProductRow) => p.purchasedAt ?? p.createdAt
    const sorted = [...products].sort((a, b) => (effectiveDate(a) < effectiveDate(b) ? -1 : 1))
    const countryCounters = new Map<string, number>()
    sorted.forEach((product, index) => {
      const country = product.client.country
      const countryRank = (countryCounters.get(country) ?? 0) + 1
      countryCounters.set(country, countryRank)
      map.set(product.id, { globalRank: index + 1, countryRank })
    })
    return map
  }, [products])

  const query = search.trim().toLowerCase()
  const filteredProducts = products?.filter((product) => {
    if (query) {
      const haystack = `${product.client.companyName} ${product.serialNumber} ${product.hardwareNumber}`.toLowerCase()
      if (!haystack.includes(query)) return false
    }
    if (countryFilter && product.client.country !== countryFilter) return false
    if (fromDate && (!product.purchasedAt || product.purchasedAt < fromDate)) return false
    if (toDate && (!product.purchasedAt || product.purchasedAt > toDate)) return false
    return true
  })

  return (
    <div>
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">{products?.length ?? 0} unidades vendidas</p>
        <button
          onClick={() => setCreating((v) => !v)}
          className="rounded-lg bg-eb-teal px-3 py-1.5 text-sm font-semibold text-white"
        >
          {creating ? 'Cancelar' : '+ Registrar venta'}
        </button>
      </div>

      <div className="mt-3 space-y-2">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Buscar por cliente, serie o hardware..."
        />
        <div className="flex flex-wrap gap-2">
          <select
            value={countryFilter}
            onChange={(e) => setCountryFilter(e.target.value)}
            className={`${inputClass} w-auto`}
          >
            <option value="">Todos los países</option>
            {countries.map((country) => (
              <option key={country} value={country}>
                {country}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            title="Desde"
            className={`${inputClass} w-auto`}
          />
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            title="Hasta"
            className={`${inputClass} w-auto`}
          />
        </div>
      </div>

      {creating && (
        <ProductForm
          clients={clients}
          cableTypes={cableTypes}
          onSaved={() => { setCreating(false); refresh() }}
          onCancel={() => setCreating(false)}
          onCableTypesChanged={refreshCableTypes}
        />
      )}

      <div className="mt-4 space-y-2">
        {filteredProducts?.map((product) => {
          const ranks = ranksByProductId.get(product.id)
          const retired = !!product.retiredAt
          const downstreamClients = downstreamClientsByDealerId.get(product.client.id) ?? []
          return (
            <div
              key={product.id}
              className={`rounded-xl border p-4 ${
                retired ? 'border-slate-200 bg-slate-100/80' : 'border-slate-200 bg-white/90'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-3">
                  <div className="flex shrink-0 flex-col items-center pt-0.5">
                    <span className="text-lg font-bold leading-none text-eb-blue-dark">
                      #{ranks?.globalRank}
                    </span>
                    <span className="mt-0.5 flex items-center gap-1 text-xs leading-none text-slate-400">
                      #{ranks?.countryRank} <span>{countryFlag(product.client.country)}</span>
                    </span>
                  </div>

                  <button
                    onClick={() => setEditingId(editingId === product.id ? null : product.id)}
                    className="flex-1 text-left"
                  >
                    <p className="flex items-center gap-2 text-sm font-semibold text-eb-blue-dark">
                      {product.productName} · {product.client.companyName}
                      {retired && (
                        <span className="rounded-full bg-slate-300 px-2 py-0.5 text-[10px] font-medium text-slate-700">
                          Dado de baja
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-slate-500">
                      Serie {product.serialNumber} · HW {product.hardwareNumber} · {product.client.country}
                    </p>
                    {product.cables.length > 0 && (
                      <p className="text-xs text-slate-400">
                        Cables: {product.cables.map((c) => c.cableType.name).join(', ')}
                      </p>
                    )}
                    <p className="text-[11px] text-slate-400">
                      {product.purchasedAt ? `Comprado: ${product.purchasedAt}` : 'Sin fecha de compra'}
                      {product.soldToEndUserAt && ` · Vendido a cliente final: ${product.soldToEndUserAt}`}
                    </p>
                    {product.observations && (
                      <p className="mt-1 text-xs text-slate-500">{product.observations}</p>
                    )}
                  </button>
                </div>

                <div className="flex shrink-0 flex-col items-end gap-2">
                  <button
                    onClick={() => setConfirmingDeleteId(product.id)}
                    className="text-slate-400 hover:text-red-600"
                    title="Eliminar producto"
                  >
                    ✕
                  </button>
                  <button
                    disabled={retiringId === product.id}
                    onClick={() => handleToggleRetired(product)}
                    className="whitespace-nowrap text-xs text-eb-blue underline disabled:opacity-50"
                  >
                    {retired ? 'Reactivar' : 'Dar de baja'}
                  </button>
                  {downstreamClients.length > 0 && (
                    <button
                      onClick={() => setTransferringId(transferringId === product.id ? null : product.id)}
                      className="whitespace-nowrap text-xs text-eb-teal-dark underline"
                    >
                      Vender a cliente final
                    </button>
                  )}
                </div>
              </div>

              {transferringId === product.id && (
                <TransferToEndClientPanel
                  product={product}
                  downstreamClients={downstreamClients}
                  onCancel={() => setTransferringId(null)}
                  onTransferred={() => { setTransferringId(null); refresh() }}
                />
              )}

              {confirmingDeleteId === product.id && (
                <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3">
                  <p className="text-xs text-red-700">
                    ¿Eliminar esta unidad? Esta acción no se puede deshacer.
                  </p>
                  <div className="mt-2 flex gap-2">
                    <button
                      onClick={() => setConfirmingDeleteId(null)}
                      className="flex-1 rounded-lg border border-slate-300 py-1.5 text-sm text-slate-600"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={() =>
                        ebDeleteClientProduct(product.id).then(() => {
                          setConfirmingDeleteId(null)
                          refresh()
                        })
                      }
                      className="flex-1 rounded-lg bg-red-600 py-1.5 text-sm font-semibold text-white"
                    >
                      Eliminar
                    </button>
                  </div>
                </div>
              )}

              {editingId === product.id && (
                <ProductForm
                  product={product}
                  clients={clients}
                  cableTypes={cableTypes}
                  onSaved={() => { setEditingId(null); refresh() }}
                  onCancel={() => setEditingId(null)}
                  onCableTypesChanged={refreshCableTypes}
                />
              )}
            </div>
          )
        })}
        {filteredProducts?.length === 0 && (
          <p className="text-xs text-slate-400">Ninguna venta registrada todavía.</p>
        )}
      </div>
    </div>
  )
}
