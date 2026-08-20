import { useEffect, useMemo, useState } from 'react'
import {
  listCableChecks,
  listEbCableTypes,
  type ListCableChecksData,
  type ListEbCableTypesData,
} from '@dataconnect/generated'
import { FRESH } from '../../lib/dataConnectOptions'
import { ebRegisterCableCheck } from '../../lib/ebEngineering'

type CableCheckRow = ListCableChecksData['cableChecks'][number]
type CableTypeRow = ListEbCableTypesData['ebCableTypes'][number]

// Stock = registered cables (via the ESP32 tester or registered manually
// here) not yet claimed by a product sale. Covers both real cables and
// non-cable stock tracked the same way, like the EBcontroller case (see
// EbCableType "Maleta EBcontroller") - registering one here just creates a
// normal CableCheck row, so it merges into the same counts and the same
// "assign to a sale" picker as everything else.
export function EbStockTab() {
  const [checks, setChecks] = useState<CableCheckRow[] | null>(null)
  const [cableTypes, setCableTypes] = useState<CableTypeRow[] | null>(null)
  const [registerTypeId, setRegisterTypeId] = useState('')
  const [registering, setRegistering] = useState(false)

  function refresh() {
    return listCableChecks(FRESH).then((res) => setChecks(res.data.cableChecks))
  }

  useEffect(() => {
    refresh()
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
      <div className="flex flex-wrap items-end gap-2 rounded-xl border border-slate-200 bg-white/90 p-4">
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
    </div>
  )
}
