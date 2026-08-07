import { Cpu } from 'lucide-react'

type FieldRow = { es: string; en: string; value: string }

/**
 * Renders one EbClientProduct exactly like the physical purchase label EB
 * Engineering hands out with each unit (teal header + bilingual field rows +
 * product photo) - this is what a client sees on "Mis productos" for every
 * unit they own, and what admins preview under Productos > Vista cliente
 * without needing to log in as the client.
 */
export function EbControllerProductCard({
  productName,
  purchasedAt,
  hardwareNumber,
  serialNumber,
  softwareVersion,
}: {
  productName: string
  purchasedAt?: string | null
  hardwareNumber: string
  serialNumber: string
  softwareVersion?: string | null
}) {
  const rows: FieldRow[] = [
    { es: 'Fecha de compra:', en: 'Date of Invoice:', value: purchasedAt ?? '-' },
    { es: 'Versión de Hardware:', en: 'Hardware Version:', value: hardwareNumber },
    { es: 'Número de serie:', en: 'Serial Number:', value: serialNumber },
    { es: 'Versión de Software:', en: 'Software Version:', value: softwareVersion ?? '-' },
  ]

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="bg-eb-teal-dark px-4 py-2">
        <h3 className="text-sm font-semibold text-white">{productName}</h3>
      </div>
      <div className="flex items-center gap-4 p-4">
        <div className="flex-1 space-y-3">
          {rows.map((row) => (
            <div key={row.es} className="flex items-center justify-between gap-4">
              <p className="text-xs leading-tight text-slate-500">
                {row.es}
                <br />
                {row.en}
              </p>
              <p className="whitespace-nowrap text-sm text-slate-700">{row.value}</p>
            </div>
          ))}
        </div>
        {/* Placeholder until EB Engineering provides the real product photo asset. */}
        <div
          className="flex h-24 w-28 shrink-0 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50"
          title="Foto del producto pendiente de configurar"
        >
          <Cpu className="h-8 w-8 text-slate-300" />
        </div>
      </div>
    </div>
  )
}

type CableTypeRef = { cableType: { id: string; code: string; name: string } }
type RegisteredCableRef = {
  id: string
  sequenceNumber: number
  cableType: { id: string; code: string; name: string }
}

/** The "which cables came with this sale" section shown under each card - split
 * between specific ESP32-tested units (with a sequence number) and, for older
 * sales that predate that tester, just the generic cable type. */
export function EbAssignedCablesSection({
  cables,
  registeredCables,
}: {
  cables: CableTypeRef[]
  registeredCables: RegisteredCableRef[]
}) {
  const hasAny = cables.length > 0 || registeredCables.length > 0

  return (
    <div className="rounded-xl border border-slate-200 bg-white/90 p-4">
      <p className="text-sm font-semibold text-eb-blue-dark">Cables asignados</p>
      {!hasAny && <p className="mt-1 text-xs text-slate-400">Sin cables asignados.</p>}
      {registeredCables.length > 0 && (
        <ul className="mt-2 space-y-1">
          {registeredCables.map((c) => (
            <li key={c.id} className="text-sm text-slate-700">
              #{c.sequenceNumber} · {c.cableType.name} ({c.cableType.code})
            </li>
          ))}
        </ul>
      )}
      {cables.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-2">
          {cables.map((c) => (
            <li
              key={c.cableType.id}
              className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600"
            >
              {c.cableType.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
