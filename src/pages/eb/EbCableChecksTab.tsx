import { useEffect, useMemo, useState } from 'react'
import {
  listCableChecks,
  listEbCableTypes,
  type ListCableChecksData,
  type ListEbCableTypesData,
} from '@dataconnect/generated'
import { FRESH } from '../../lib/dataConnectOptions'
import { ebDeleteCableCheck } from '../../lib/ebEngineering'

type CableCheckRow = ListCableChecksData['cableChecks'][number]
type CableTypeRow = ListEbCableTypesData['ebCableTypes'][number]

// Log of continuity checks reported by the shop's ESP32 cable tester (see
// functions/index.js's esp32RegisterCableCheck). Assigning a specific
// checked cable to an EbClientProduct happens from the Productos tab - this
// is otherwise read-only except for deleting a check that was never
// assigned, since the tester misfires sometimes and logs several checks for
// what was really one cable.
export function EbCableChecksTab() {
  const [checks, setChecks] = useState<CableCheckRow[] | null>(null)
  const [cableTypes, setCableTypes] = useState<CableTypeRow[] | null>(null)
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null)

  function refresh() {
    return listCableChecks(FRESH).then((res) => setChecks(res.data.cableChecks))
  }

  useEffect(() => {
    refresh()
    listEbCableTypes(FRESH).then((res) => setCableTypes(res.data.ebCableTypes))
  }, [])

  async function handleDelete(cableCheckId: string) {
    await ebDeleteCableCheck(cableCheckId)
    setConfirmingDeleteId(null)
    await refresh()
  }

  // Stock = registered cables not yet claimed by a product sale.
  const stockByTypeId = useMemo(() => {
    const map = new Map<string, number>()
    for (const check of checks ?? []) {
      if (check.product) continue
      map.set(check.cableType.id, (map.get(check.cableType.id) ?? 0) + 1)
    }
    return map
  }, [checks])

  const midpoint = cableTypes ? Math.ceil(cableTypes.length / 2) : 0
  const stockColumns = cableTypes
    ? [cableTypes.slice(0, midpoint), cableTypes.slice(midpoint)]
    : []

  return (
    <div>
      {cableTypes && cableTypes.length > 0 && (
        <div className="mb-4 flex flex-col gap-3 sm:flex-row">
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

      <p className="text-sm text-slate-500">{checks?.length ?? 0} cables comprobados</p>

      <div className="mt-3 space-y-2">
        {checks === null && <p className="text-sm text-slate-500">Cargando...</p>}
        {checks?.length === 0 && (
          <p className="text-xs text-slate-400">Todavía no se ha registrado ningún cable.</p>
        )}
        {checks?.map((check) => (
          <div key={check.id} className="rounded-xl border border-slate-200 bg-white/90 p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-eb-blue-dark">#{check.sequenceNumber}</p>
                <p className="text-sm text-slate-700">
                  {check.cableType.name} ({check.cableType.code})
                </p>
                <p className="text-xs text-slate-500">Comprobado por {check.checkedBy.displayName}</p>
                {check.product ? (
                  <p className="mt-1 text-xs text-eb-teal-dark">
                    Asignado a {check.product.serialNumber} · {check.product.client.companyName}
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-slate-400">Sin asignar</p>
                )}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-2">
                <p className="text-xs text-slate-400">
                  {new Date(check.checkedAt).toLocaleString('es-ES')}
                </p>
                {!check.product && (
                  <button
                    onClick={() => setConfirmingDeleteId(check.id)}
                    className="text-xs font-semibold text-red-600 hover:underline"
                  >
                    Eliminar
                  </button>
                )}
              </div>
            </div>

            {confirmingDeleteId === check.id && (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3">
                <p className="text-xs text-red-700">
                  ¿Eliminar el cable #{check.sequenceNumber} ({check.cableType.name})? Esta acción
                  no se puede deshacer.
                </p>
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={() => setConfirmingDeleteId(null)}
                    className="flex-1 rounded-lg border border-slate-300 py-1.5 text-sm text-slate-600"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => handleDelete(check.id)}
                    className="flex-1 rounded-lg bg-red-600 py-1.5 text-sm font-semibold text-white"
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
