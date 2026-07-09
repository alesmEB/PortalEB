import { useEffect, useState } from 'react'
import {
  createBoat,
  createEngine,
  deleteEngine,
  listBoats,
  listCustomers,
  updateBoat,
  updateEngine,
  type ListBoatsData,
  type ListCustomersData,
} from '@dataconnect/generated'
import { SearchInput } from '../../components/SearchInput'
import { FRESH } from '../../lib/dataConnectOptions'

type BoatRow = ListBoatsData['boats'][number]
type EngineRowData = BoatRow['engines'][number]
type Customers = ListCustomersData['customers']

const inputClass =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 outline-none focus:border-eb-blue'
const smallInputClass =
  'rounded-lg border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-eb-blue'

function EngineRow({ engine, onChanged }: { engine: EngineRowData; onChanged: () => void }) {
  const [engineType, setEngineType] = useState(engine.engineType)
  const [chassisNumber, setChassisNumber] = useState(engine.chassisNumber)
  const [propellerSerialNumber, setPropellerSerialNumber] = useState(engine.propellerSerialNumber)
  const [submitting, setSubmitting] = useState(false)

  async function handleSave() {
    setSubmitting(true)
    try {
      await updateEngine({
        id: engine.id,
        engineType: engineType.trim(),
        chassisNumber: chassisNumber.trim(),
        propellerSerialNumber: propellerSerialNumber.trim(),
      })
      onChanged()
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete() {
    if (!confirm('¿Eliminar este motor?')) return
    setSubmitting(true)
    try {
      await deleteEngine({ id: engine.id })
      onChanged()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="grid grid-cols-1 gap-2 rounded-lg border border-slate-200 p-2 sm:grid-cols-3">
      <input
        value={engineType}
        onChange={(e) => setEngineType(e.target.value)}
        placeholder="Tipo de motor"
        className={smallInputClass}
      />
      <input
        value={chassisNumber}
        onChange={(e) => setChassisNumber(e.target.value)}
        placeholder="Nº chasis"
        className={smallInputClass}
      />
      <input
        value={propellerSerialNumber}
        onChange={(e) => setPropellerSerialNumber(e.target.value)}
        placeholder="Nº serie propulsor"
        className={smallInputClass}
      />
      <div className="col-span-full flex gap-2">
        <button
          disabled={submitting}
          onClick={handleSave}
          className="flex-1 rounded-lg bg-eb-blue py-1.5 text-xs font-semibold text-white disabled:opacity-50"
        >
          Guardar
        </button>
        <button
          disabled={submitting}
          onClick={handleDelete}
          className="rounded-lg border border-red-300 px-3 py-1.5 text-xs text-red-600"
        >
          Eliminar
        </button>
      </div>
    </div>
  )
}

function AddEngineToBoat({ boatId, onAdded }: { boatId: string; onAdded: () => void }) {
  const [engineType, setEngineType] = useState('')
  const [chassisNumber, setChassisNumber] = useState('')
  const [propellerSerialNumber, setPropellerSerialNumber] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const canSubmit = engineType.trim() && chassisNumber.trim() && propellerSerialNumber.trim()

  async function handleSubmit() {
    setSubmitting(true)
    try {
      await createEngine({
        boatId,
        engineType: engineType.trim(),
        chassisNumber: chassisNumber.trim(),
        propellerSerialNumber: propellerSerialNumber.trim(),
      })
      setEngineType('')
      setChassisNumber('')
      setPropellerSerialNumber('')
      onAdded()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="grid grid-cols-1 gap-2 rounded-lg border border-dashed border-slate-300 p-2 sm:grid-cols-3">
      <input
        placeholder="Tipo de motor"
        value={engineType}
        onChange={(e) => setEngineType(e.target.value)}
        className={smallInputClass}
      />
      <input
        placeholder="Nº chasis"
        value={chassisNumber}
        onChange={(e) => setChassisNumber(e.target.value)}
        className={smallInputClass}
      />
      <input
        placeholder="Nº serie propulsor"
        value={propellerSerialNumber}
        onChange={(e) => setPropellerSerialNumber(e.target.value)}
        className={smallInputClass}
      />
      <button
        disabled={!canSubmit || submitting}
        onClick={handleSubmit}
        className="col-span-full rounded-lg bg-eb-teal py-1.5 text-xs font-semibold text-white disabled:opacity-50"
      >
        + Añadir motor
      </button>
    </div>
  )
}

function BoatForm({
  boat,
  customers,
  onSaved,
  onEnginesChanged,
}: {
  boat?: BoatRow
  customers: Customers
  onSaved: () => void
  onEnginesChanged: () => void
}) {
  const [ownerId, setOwnerId] = useState(boat?.ownerId ?? customers[0]?.id ?? '')
  const [name, setName] = useState(boat?.name ?? '')
  const [registrationNumber, setRegistrationNumber] = useState(boat?.registrationNumber ?? '')
  const [newEngines, setNewEngines] = useState(
    boat ? [] : [{ engineType: '', chassisNumber: '', propellerSerialNumber: '' }],
  )
  const [submitting, setSubmitting] = useState(false)

  function updateNewEngine(index: number, field: keyof (typeof newEngines)[number], value: string) {
    setNewEngines((prev) => prev.map((e, i) => (i === index ? { ...e, [field]: value } : e)))
  }

  const canSubmit = name.trim() && ownerId

  async function handleSubmit() {
    setSubmitting(true)
    try {
      if (boat) {
        await updateBoat({
          id: boat.id,
          ownerId,
          name: name.trim(),
          registrationNumber: registrationNumber.trim() || undefined,
        })
      } else {
        const res = await createBoat({
          ownerId,
          name: name.trim(),
          registrationNumber: registrationNumber.trim() || undefined,
        })
        const boatId = res.data.boat_insert.id
        const filled = newEngines.filter(
          (e) => e.engineType.trim() && e.chassisNumber.trim() && e.propellerSerialNumber.trim(),
        )
        for (const engine of filled) {
          await createEngine({ boatId, ...engine })
        }
      }
      onSaved()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mt-3 space-y-3 border-t border-slate-200 pt-3 first:mt-0 first:border-t-0 first:pt-0">
      <label className="block text-xs font-medium text-slate-500">
        Cliente propietario
        <select value={ownerId} onChange={(e) => setOwnerId(e.target.value)} className={inputClass}>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <input
        placeholder="Nombre"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className={inputClass}
      />
      <input
        placeholder="Matrícula (opcional)"
        value={registrationNumber}
        onChange={(e) => setRegistrationNumber(e.target.value)}
        className={inputClass}
      />

      {!boat && (
        <div>
          <p className="text-xs font-medium text-slate-500">Motores</p>
          {newEngines.map((engine, i) => (
            <div key={i} className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
              <input
                placeholder="Tipo de motor"
                value={engine.engineType}
                onChange={(e) => updateNewEngine(i, 'engineType', e.target.value)}
                className={smallInputClass}
              />
              <input
                placeholder="Nº chasis"
                value={engine.chassisNumber}
                onChange={(e) => updateNewEngine(i, 'chassisNumber', e.target.value)}
                className={smallInputClass}
              />
              <input
                placeholder="Nº serie propulsor"
                value={engine.propellerSerialNumber}
                onChange={(e) => updateNewEngine(i, 'propellerSerialNumber', e.target.value)}
                className={smallInputClass}
              />
            </div>
          ))}
          <button
            type="button"
            onClick={() =>
              setNewEngines((prev) => [
                ...prev,
                { engineType: '', chassisNumber: '', propellerSerialNumber: '' },
              ])
            }
            className="mt-2 text-sm text-eb-blue"
          >
            + Añadir motor
          </button>
        </div>
      )}

      <button
        disabled={!canSubmit || submitting}
        onClick={handleSubmit}
        className="w-full rounded-lg bg-eb-blue py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        {submitting ? 'Guardando...' : boat ? 'Guardar cambios' : 'Crear embarcación/máquina'}
      </button>

      {boat && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-slate-500">Motores</p>
          {boat.engines.map((engine) => (
            <EngineRow key={engine.id} engine={engine} onChanged={onEnginesChanged} />
          ))}
          <AddEngineToBoat boatId={boat.id} onAdded={onEnginesChanged} />
        </div>
      )}
    </div>
  )
}

export function BoatsAdmin() {
  const [boats, setBoats] = useState<ListBoatsData['boats'] | null>(null)
  const [customers, setCustomers] = useState<Customers | null>(null)
  const [creating, setCreating] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  async function refresh() {
    const [boatsRes, customersRes] = await Promise.all([listBoats(FRESH), listCustomers(FRESH)])
    setBoats(boatsRes.data.boats)
    setCustomers(customersRes.data.customers)
  }

  useEffect(() => {
    refresh()
  }, [])

  const query = search.trim().toLowerCase()
  const filteredBoats = boats?.filter(
    (boat) =>
      !query ||
      boat.name.toLowerCase().includes(query) ||
      boat.registrationNumber?.toLowerCase().includes(query) ||
      boat.owner.name.toLowerCase().includes(query),
  )

  return (
    <div>
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">{boats?.length ?? 0} embarcaciones/máquinas</p>
        <button
          onClick={() => setCreating((v) => !v)}
          className="rounded-lg bg-eb-teal px-3 py-1.5 text-sm font-semibold text-white"
        >
          {creating ? 'Cancelar' : '+ Nueva'}
        </button>
      </div>

      <div className="mt-3">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Buscar por nombre, matrícula o cliente..."
        />
      </div>

      {creating && customers && (
        <BoatForm
          customers={customers}
          onSaved={() => {
            setCreating(false)
            refresh()
          }}
          onEnginesChanged={refresh}
        />
      )}

      <div className="mt-4 space-y-2">
        {filteredBoats?.map((boat) => (
          <div key={boat.id} className="rounded-xl border border-slate-200 bg-white/90 p-4">
            <button
              onClick={() => setEditingId(editingId === boat.id ? null : boat.id)}
              className="flex w-full items-center justify-between text-left"
            >
              <div>
                <p className="text-sm font-semibold text-eb-blue-dark">{boat.name}</p>
                <p className="text-xs text-slate-500">
                  {boat.owner.name} · {boat.engines.length} motor
                  {boat.engines.length === 1 ? '' : 'es'}
                </p>
              </div>
            </button>
            {editingId === boat.id && customers && (
              <BoatForm
                boat={boat}
                customers={customers}
                onSaved={() => {
                  setEditingId(null)
                  refresh()
                }}
                onEnginesChanged={refresh}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
