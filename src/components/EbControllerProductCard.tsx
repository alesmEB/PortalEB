import ebControllerPhoto from '../assets/eb/ebcontroller.webp'
import { ebT, type EbLang } from '../lib/ebI18n'

type FieldRow = { key: string; label: string; value: string }

/**
 * Renders one EbClientProduct like the physical purchase label EB
 * Engineering hands out with each unit (teal header + field rows + product
 * photo), translated to `lang` - this is what a client sees on "Mis
 * productos" for every unit they own, and what admins preview under
 * Productos > Vista cliente without needing to log in as the client.
 */
export function EbControllerProductCard({
  productName,
  purchasedAt,
  hardwareNumber,
  serialNumber,
  softwareVersion,
  lang,
}: {
  productName: string
  purchasedAt?: string | null
  hardwareNumber: string
  serialNumber: string
  softwareVersion?: string | null
  lang: EbLang
}) {
  const rows: FieldRow[] = [
    { key: 'purchasedAt', label: ebT(lang, 'fieldPurchaseDate'), value: purchasedAt ?? '-' },
    { key: 'hardwareNumber', label: ebT(lang, 'fieldHardwareVersion'), value: hardwareNumber },
    { key: 'serialNumber', label: ebT(lang, 'fieldSerialNumber'), value: serialNumber },
    { key: 'softwareVersion', label: ebT(lang, 'fieldSoftwareVersion'), value: softwareVersion ?? '-' },
  ]

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="bg-eb-teal-dark px-4 py-2">
        <h3 className="text-sm font-semibold text-white">{productName}</h3>
      </div>
      <div className="flex items-center gap-4 p-4">
        <div className="flex-1 space-y-3">
          {rows.map((row) => (
            <div key={row.key} className="flex items-center justify-between gap-4">
              <p className="text-xs leading-tight text-slate-500">{row.label}</p>
              <p className="whitespace-nowrap text-sm text-slate-700">{row.value}</p>
            </div>
          ))}
        </div>
        <img
          src={ebControllerPhoto}
          alt={productName}
          className="h-20 w-32 shrink-0 object-contain"
        />
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
  lang,
}: {
  cables: CableTypeRef[]
  registeredCables: RegisteredCableRef[]
  lang: EbLang
}) {
  const hasAny = cables.length > 0 || registeredCables.length > 0

  return (
    <div className="rounded-xl border border-slate-200 bg-white/90 p-4">
      <p className="text-sm font-semibold text-eb-blue-dark">{ebT(lang, 'cablesTitle')}</p>
      {!hasAny && <p className="mt-1 text-xs text-slate-400">{ebT(lang, 'noCables')}</p>}
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
