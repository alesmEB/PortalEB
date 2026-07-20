import { useEffect, useState } from 'react'
import { listCableChecks, type ListCableChecksData } from '@dataconnect/generated'
import { FRESH } from '../../lib/dataConnectOptions'

type CableCheckRow = ListCableChecksData['cableChecks'][number]

// Read-only log of continuity checks reported by the shop's ESP32 cable
// tester (see functions/index.js's esp32RegisterCableCheck). Assigning a
// specific checked cable to an EbClientProduct is a later step - view only
// for now.
export function EbCableChecksTab() {
  const [checks, setChecks] = useState<CableCheckRow[] | null>(null)

  useEffect(() => {
    listCableChecks(FRESH).then((res) => setChecks(res.data.cableChecks))
  }, [])

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
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-eb-blue-dark">#{check.sequenceNumber}</p>
              <p className="text-xs text-slate-400">
                {new Date(check.checkedAt).toLocaleString('es-ES')}
              </p>
            </div>
            <p className="text-sm text-slate-700">
              {check.cableType.name} ({check.cableType.code})
            </p>
            <p className="text-xs text-slate-500">Comprobado por {check.checkedBy.displayName}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
