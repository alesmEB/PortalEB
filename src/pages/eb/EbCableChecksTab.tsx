import { useEffect, useState } from 'react'
import { listCableChecks, type ListCableChecksData } from '@dataconnect/generated'
import { FRESH } from '../../lib/dataConnectOptions'
import { ebDeleteCableCheck } from '../../lib/ebEngineering'

type CableCheckRow = ListCableChecksData['cableChecks'][number]

// Log of continuity checks reported by the shop's ESP32 cable tester (see
// functions/index.js's esp32RegisterCableCheck). Assigning a specific
// checked cable to an EbClientProduct happens from the Productos tab - this
// is otherwise read-only except for deleting a check that was never
// assigned, since the tester misfires sometimes and logs several checks for
// what was really one cable.
export function EbCableChecksTab() {
  const [checks, setChecks] = useState<CableCheckRow[] | null>(null)
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null)

  function refresh() {
    return listCableChecks(FRESH).then((res) => setChecks(res.data.cableChecks))
  }

  useEffect(() => {
    refresh()
  }, [])

  async function handleDelete(cableCheckId: string) {
    await ebDeleteCableCheck(cableCheckId)
    setConfirmingDeleteId(null)
    await refresh()
  }

  return (
    <div>
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
