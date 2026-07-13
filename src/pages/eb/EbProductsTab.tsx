import { useEffect, useMemo, useState } from 'react'
import {
  listEbCableTypes,
  listEbClientProducts,
  listEbClients,
  type ListEbCableTypesData,
  type ListEbClientProductsData,
  type ListEbClientsData,
} from '@dataconnect/generated'
import { SearchInput } from '../../components/SearchInput'
import { FRESH } from '../../lib/dataConnectOptions'
import {
  ebAddClientProduct,
  ebCreateCableType,
  ebDeleteClientProduct,
  ebUpdateClientProduct,
} from '../../lib/ebEngineering'
import { uploadEbProgramFile } from '../../lib/ebProductStorage'

type ProductRow = ListEbClientProductsData['ebClientProducts'][number]
type ClientRow = ListEbClientsData['ebClients'][number]
type CableType = ListEbCableTypesData['ebCableTypes'][number]

const inputClass =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 outline-none focus:border-eb-blue'

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
            placeholder="Código (p.ej. EBEN-180100)"
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
  const [selectedCables, setSelectedCables] = useState<Set<string>>(
    new Set(product?.cables.map((c) => c.cableType.id) ?? []),
  )
  const [programFile, setProgramFile] = useState<File | null>(null)
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
      let programFileUrl = product?.programFileUrl ?? undefined
      if (programFile) {
        programFileUrl = await uploadEbProgramFile(programFile)
      }
      const input = {
        clientId,
        serialNumber: serialNumber.trim(),
        hardwareNumber: hardwareNumber.trim(),
        purchasedAt: purchasedAt || undefined,
        programFileUrl,
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
        Archivo de programa personalizado (opcional)
        {product?.programFileUrl && !programFile && (
          <a
            href={product.programFileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 block text-xs text-eb-blue underline"
          >
            Ver archivo actual
          </a>
        )}
        <input
          type="file"
          onChange={(e) => setProgramFile(e.target.files?.[0] ?? null)}
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

export function EbProductsTab() {
  const [products, setProducts] = useState<ProductRow[] | null>(null)
  const [clients, setClients] = useState<ClientRow[]>([])
  const [cableTypes, setCableTypes] = useState<CableType[]>([])
  const [creating, setCreating] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null)
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

  const countries = useMemo(
    () => [...new Set(clients.map((c) => c.country))].sort(),
    [clients],
  )

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
        {filteredProducts?.map((product) => (
          <div key={product.id} className="rounded-xl border border-slate-200 bg-white/90 p-4">
            <div className="flex items-start justify-between gap-2">
              <button
                onClick={() => setEditingId(editingId === product.id ? null : product.id)}
                className="flex-1 text-left"
              >
                <p className="text-sm font-semibold text-eb-blue-dark">
                  {product.productName} · {product.client.companyName}
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
                </p>
              </button>
              <button
                onClick={() => setConfirmingDeleteId(product.id)}
                className="text-slate-400 hover:text-red-600"
                title="Eliminar producto"
              >
                ✕
              </button>
            </div>

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
        ))}
        {filteredProducts?.length === 0 && (
          <p className="text-xs text-slate-400">Ninguna venta registrada todavía.</p>
        )}
      </div>
    </div>
  )
}
