import { useEffect, useMemo, useState } from 'react'
import {
  listCableChecks,
  listEbCableTypes,
  listEbScreens,
  type ListCableChecksData,
  type ListEbCableTypesData,
  type ListEbScreensData,
} from '@dataconnect/generated'
import { FRESH } from '../../lib/dataConnectOptions'
import {
  ebDeleteScreen,
  ebRegisterCableCheck,
  ebRegisterScreen,
  ebSetScreenUnavailable,
  ebUpdateScreen,
} from '../../lib/ebEngineering'

type CableCheckRow = ListCableChecksData['cableChecks'][number]
type CableTypeRow = ListEbCableTypesData['ebCableTypes'][number]
type ScreenRow = ListEbScreensData['ebScreens'][number]

// The display units EB Engineering sells alongside an EBcontroller (see
// EbScreen in schema.gql) - stock like cables, but each unit is
// individually serial-numbered, so this lists the units themselves rather
// than just a per-reference count.
const DEFAULT_SCREEN_REFERENCE = 'EBEN000000'
const DEFAULT_SCREEN_MODEL = 'PV450'

function ScreensSection({ screens, onChanged }: { screens: ScreenRow[] | null; onChanged: () => Promise<unknown> }) {
  const [reference, setReference] = useState(DEFAULT_SCREEN_REFERENCE)
  const [model, setModel] = useState(DEFAULT_SCREEN_MODEL)
  const [serialNumber, setSerialNumber] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [markingId, setMarkingId] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState({ reference: '', model: '', serialNumber: '' })

  async function handleRegister() {
    if (!serialNumber.trim()) return
    setSubmitting(true)
    setError(null)
    try {
      await ebRegisterScreen({ reference, model, serialNumber: serialNumber.trim() })
      setSerialNumber('')
      await onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleSetUnavailable(screenId: string, newReason: string) {
    setSubmitting(true)
    setError(null)
    try {
      await ebSetScreenUnavailable(screenId, newReason)
      setMarkingId(null)
      setReason('')
      await onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar.')
    } finally {
      setSubmitting(false)
    }
  }

  function startEditing(screen: ScreenRow) {
    setEditingId(screen.id)
    setConfirmingDeleteId(null)
    setMarkingId(null)
    setEditDraft({
      reference: screen.reference,
      model: screen.model,
      serialNumber: screen.serialNumber,
    })
  }

  async function handleSaveEdit(screenId: string) {
    setSubmitting(true)
    setError(null)
    try {
      await ebUpdateScreen({ screenId, ...editDraft })
      setEditingId(null)
      await onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(screenId: string) {
    setSubmitting(true)
    setError(null)
    try {
      await ebDeleteScreen(screenId)
      setConfirmingDeleteId(null)
      await onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo eliminar.')
    } finally {
      setSubmitting(false)
    }
  }

  const inStock = (screens ?? []).filter((s) => !s.productId && !s.unavailableAt)

  return (
    <div className="mt-6">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-semibold text-eb-blue-dark">Pantallas</h3>
        <p className="text-xs text-slate-500">
          {inStock.length} en stock · {screens?.length ?? 0} registradas
        </p>
      </div>

      <div className="mt-2 flex flex-wrap items-end gap-2 rounded-xl border border-slate-200 bg-white/90 p-4">
        <label className="flex-1 basis-28 text-xs font-medium text-slate-500">
          Referencia
          <input
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 outline-none focus:border-eb-blue"
          />
        </label>
        <label className="flex-1 basis-24 text-xs font-medium text-slate-500">
          Modelo
          <input
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 outline-none focus:border-eb-blue"
          />
        </label>
        <label className="flex-1 basis-32 text-xs font-medium text-slate-500">
          Número de serie
          <input
            value={serialNumber}
            onChange={(e) => setSerialNumber(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 outline-none focus:border-eb-blue"
          />
        </label>
        <button
          onClick={handleRegister}
          disabled={submitting || !serialNumber.trim() || !reference.trim() || !model.trim()}
          className="rounded-lg bg-eb-teal px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          Registrar
        </button>
      </div>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      <div className="mt-2 space-y-2">
        {screens?.length === 0 && (
          <p className="text-xs text-slate-400">Todavía no se ha registrado ninguna pantalla.</p>
        )}
        {screens?.map((screen) => (
          <div key={screen.id} className="rounded-xl border border-slate-200 bg-white/90 p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-eb-blue-dark">
                  {screen.model} · {screen.serialNumber}
                </p>
                <p className="text-xs text-slate-500">
                  {screen.reference} · registrada por {screen.registeredBy.displayName}
                </p>
                {screen.product ? (
                  <p className="mt-1 text-xs text-eb-teal-dark">
                    Asignada a {screen.product.serialNumber} · {screen.product.client.companyName}
                  </p>
                ) : screen.unavailableAt ? (
                  <p className="mt-1 text-xs text-amber-700">
                    No disponible: {screen.unavailableReason}
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-slate-400">En stock</p>
                )}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-2">
                <p className="text-xs text-slate-400">
                  {new Date(screen.createdAt).toLocaleDateString('es-ES')}
                </p>
                <button
                  onClick={() => startEditing(screen)}
                  className="text-xs font-semibold text-eb-blue hover:underline"
                >
                  Editar
                </button>
                {!screen.product && !screen.unavailableAt && (
                  <button
                    onClick={() => {
                      setMarkingId(screen.id)
                      setReason('')
                    }}
                    className="text-xs font-semibold text-amber-700 hover:underline"
                  >
                    Marcar no disponible
                  </button>
                )}
                {!screen.product && screen.unavailableAt && (
                  <button
                    onClick={() => handleSetUnavailable(screen.id, '')}
                    disabled={submitting}
                    className="text-xs font-semibold text-eb-blue hover:underline disabled:opacity-50"
                  >
                    Devolver a stock
                  </button>
                )}
                {!screen.product && (
                  <button
                    onClick={() => setConfirmingDeleteId(screen.id)}
                    className="text-xs font-semibold text-red-600 hover:underline"
                  >
                    Eliminar
                  </button>
                )}
              </div>
            </div>

            {editingId === screen.id && (
              <div className="mt-3 flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <label className="flex-1 basis-28 text-xs font-medium text-slate-500">
                  Referencia
                  <input
                    value={editDraft.reference}
                    onChange={(e) => setEditDraft((d) => ({ ...d, reference: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 outline-none focus:border-eb-blue"
                  />
                </label>
                <label className="flex-1 basis-24 text-xs font-medium text-slate-500">
                  Modelo
                  <input
                    value={editDraft.model}
                    onChange={(e) => setEditDraft((d) => ({ ...d, model: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 outline-none focus:border-eb-blue"
                  />
                </label>
                <label className="flex-1 basis-32 text-xs font-medium text-slate-500">
                  Número de serie
                  <input
                    value={editDraft.serialNumber}
                    onChange={(e) => setEditDraft((d) => ({ ...d, serialNumber: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 outline-none focus:border-eb-blue"
                  />
                </label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setEditingId(null)}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-600"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => handleSaveEdit(screen.id)}
                    disabled={
                      submitting ||
                      !editDraft.reference.trim() ||
                      !editDraft.model.trim() ||
                      !editDraft.serialNumber.trim()
                    }
                    className="rounded-lg bg-eb-blue px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    Guardar
                  </button>
                </div>
              </div>
            )}

            {markingId === screen.id && (
              <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
                <p className="text-xs text-amber-800">
                  ¿A qué se ha destinado esta pantalla? Saldrá del stock con esta descripción.
                </p>
                <input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="p.ej. Reparación cliente X, demo feria..."
                  className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 outline-none focus:border-eb-blue"
                />
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={() => setMarkingId(null)}
                    className="flex-1 rounded-lg border border-slate-300 py-1.5 text-sm text-slate-600"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => handleSetUnavailable(screen.id, reason)}
                    disabled={submitting || !reason.trim()}
                    className="flex-1 rounded-lg bg-amber-600 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    Marcar no disponible
                  </button>
                </div>
              </div>
            )}

            {confirmingDeleteId === screen.id && (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3">
                <p className="text-xs text-red-700">
                  ¿Eliminar la pantalla {screen.model} · {screen.serialNumber}? Esta acción no se
                  puede deshacer.
                </p>
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={() => setConfirmingDeleteId(null)}
                    className="flex-1 rounded-lg border border-slate-300 py-1.5 text-sm text-slate-600"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => handleDelete(screen.id)}
                    disabled={submitting}
                    className="flex-1 rounded-lg bg-red-600 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    Eliminar
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// Stock = registered cables (via the ESP32 tester or registered manually
// here) not yet claimed by a product sale. Covers both real cables and
// non-cable stock tracked the same way, like the EBcontroller case (see
// EbCableType "Maleta EBcontroller") - registering one here just creates a
// normal CableCheck row, so it merges into the same counts and the same
// "assign to a sale" picker as everything else.
export function EbStockTab() {
  const [checks, setChecks] = useState<CableCheckRow[] | null>(null)
  const [cableTypes, setCableTypes] = useState<CableTypeRow[] | null>(null)
  const [screens, setScreens] = useState<ScreenRow[] | null>(null)
  const [registerTypeId, setRegisterTypeId] = useState('')
  const [registering, setRegistering] = useState(false)

  function refresh() {
    return listCableChecks(FRESH).then((res) => setChecks(res.data.cableChecks))
  }

  function refreshScreens() {
    return listEbScreens(FRESH).then((res) => setScreens(res.data.ebScreens))
  }

  useEffect(() => {
    refresh()
    refreshScreens()
    listEbCableTypes(FRESH).then((res) => {
      setCableTypes(res.data.ebCableTypes)
      setRegisterTypeId((current) => current || res.data.ebCableTypes[0]?.id || '')
    })
  }, [])

  async function handleRegister() {
    if (!registerTypeId) return
    setRegistering(true)
    try {
      await ebRegisterCableCheck(registerTypeId)
      await refresh()
    } finally {
      setRegistering(false)
    }
  }

  const stockByTypeId = useMemo(() => {
    const map = new Map<string, number>()
    for (const check of checks ?? []) {
      if (check.product) continue
      map.set(check.cableType.id, (map.get(check.cableType.id) ?? 0) + 1)
    }
    return map
  }, [checks])

  const midpoint = cableTypes ? Math.ceil(cableTypes.length / 2) : 0
  const stockColumns = cableTypes ? [cableTypes.slice(0, midpoint), cableTypes.slice(midpoint)] : []

  return (
    <div>
      <h3 className="text-sm font-semibold text-eb-blue-dark">Cables</h3>
      <div className="mt-2 flex flex-wrap items-end gap-2 rounded-xl border border-slate-200 bg-white/90 p-4">
        <label className="flex-1 text-xs font-medium text-slate-500">
          Registrar una unidad nueva en stock
          <select
            value={registerTypeId}
            onChange={(e) => setRegisterTypeId(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 outline-none focus:border-eb-blue"
          >
            {cableTypes?.map((type) => (
              <option key={type.id} value={type.id}>
                {type.name} ({type.code})
              </option>
            ))}
          </select>
        </label>
        <button
          onClick={handleRegister}
          disabled={registering || !registerTypeId}
          className="rounded-lg bg-eb-teal px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          Registrar
        </button>
      </div>

      {cableTypes && cableTypes.length > 0 && (
        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          {stockColumns.map((column, i) =>
            column.length > 0 ? (
              <div
                key={i}
                className="flex-1 overflow-hidden rounded-xl border border-slate-200 bg-white/90"
              >
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                      <th className="px-4 py-2 font-medium">Referencia</th>
                      <th className="px-4 py-2 font-medium">Cable</th>
                      <th className="px-4 py-2 text-right font-medium">En stock</th>
                    </tr>
                  </thead>
                  <tbody>
                    {column.map((type) => (
                      <tr key={type.id} className="border-b border-slate-100 last:border-0">
                        <td className="px-4 py-2 text-slate-500">{type.code}</td>
                        <td className="px-4 py-2 text-slate-700">{type.name}</td>
                        <td className="px-4 py-2 text-right font-semibold text-eb-blue-dark">
                          {stockByTypeId.get(type.id) ?? 0}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null,
          )}
        </div>
      )}

      <ScreensSection screens={screens} onChanged={refreshScreens} />
    </div>
  )
}
