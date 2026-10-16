import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  OrderLocation,
  listBoats,
  listCustomers,
  type ListBoatsData,
  type ListCustomersData,
} from '@dataconnect/generated'
import { BackButton } from '../components/BackButton'
import { FRESH } from '../lib/dataConnectOptions'
import { orderLocationLabel } from '../lib/orderCode'
import { createWorkOrder, type OrderFromAppointment } from '../lib/orderCreation'

interface EngineDraft {
  engineType: string
  chassisNumber: string
  propellerSerialNumber: string
}

const emptyEngine: EngineDraft = { engineType: '', chassisNumber: '', propellerSerialNumber: '' }

type RequiredField =
  | 'location'
  | 'customerName'
  | 'contactName'
  | 'phone'
  | 'boatName'
  | 'assetLocation'
  | 'engines'
  | 'tasks'

function RequiredMark() {
  return (
    <span className="ml-0.5 text-red-600" aria-hidden="true">
      *
    </span>
  )
}

export function NewOrderPage() {
  const navigate = useNavigate()
  const location = useLocation()
  // Read once on mount - without it the form is just a normal new order.
  const [fromAppointment] = useState<OrderFromAppointment | null>(
    () => (location.state as { fromAppointment?: OrderFromAppointment } | null)?.fromAppointment ?? null,
  )

  const [customers, setCustomers] = useState<ListCustomersData['customers']>([])
  const [boats, setBoats] = useState<ListBoatsData['boats']>([])

  const [locationCode, setLocationCode] = useState<OrderLocation | ''>(
    fromAppointment?.locationCode ?? '',
  )

  const [customerName, setCustomerName] = useState('')
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null)
  const [contactName, setContactName] = useState('')
  const [phone, setPhone] = useState('')

  const [boatName, setBoatName] = useState(fromAppointment?.boatDetails ?? '')
  const [selectedBoatId, setSelectedBoatId] = useState<string | null>(null)
  const [registrationNumber, setRegistrationNumber] = useState('')
  const [existingEngines, setExistingEngines] = useState<EngineDraft[]>([])
  const [newEngines, setNewEngines] = useState<EngineDraft[]>([{ ...emptyEngine }])

  // A visit outside our locations ("Cádiz") is where the boat is.
  const [assetLocation, setAssetLocation] = useState(fromAppointment?.customLocation ?? '')
  const [tasks, setTasks] = useState<string[]>([fromAppointment?.title ?? ''])
  const [comments, setComments] = useState(fromAppointment?.notes ?? '')

  const [submitting, setSubmitting] = useState(false)
  // Off until the first try: a fresh form all in red would only be noise.
  const [showMissing, setShowMissing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successCode, setSuccessCode] = useState<string | null>(null)
  const [successReportUrl, setSuccessReportUrl] = useState<string | null>(null)

  useEffect(() => {
    listCustomers(FRESH).then((res) => setCustomers(res.data.customers))
    listBoats(FRESH).then((res) => setBoats(res.data.boats))
  }, [])

  // The appointment's boat is free text. Once both lists arrive, run it
  // through the same matching as typing it, so a boat we already have picks
  // up its owner and engines instead of being registered a second time.
  const matchedPrefilledBoat = useRef(false)
  useEffect(() => {
    if (matchedPrefilledBoat.current || !fromAppointment?.boatDetails) return
    if (boats.length === 0 || customers.length === 0) return
    matchedPrefilledBoat.current = true
    handleBoatNameChange(fromAppointment.boatDetails)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boats, customers])

  function handleCustomerNameChange(value: string) {
    setCustomerName(value)
    const match = customers.find((c) => c.name.toLowerCase() === value.toLowerCase())
    if (match) {
      setSelectedCustomerId(match.id)
      setContactName(match.contactName)
      setPhone(match.phone)
    } else {
      setSelectedCustomerId(null)
    }
  }

  function resetCustomerSelection() {
    setSelectedCustomerId(null)
    setCustomerName('')
    setContactName('')
    setPhone('')
  }

  function handleBoatNameChange(value: string) {
    setBoatName(value)
    // Once a customer is picked, only THEIR boats can be matched as existing -
    // typing another customer's boat name just falls through to "new boat".
    const candidates = selectedCustomerId
      ? boats.filter((b) => b.ownerId === selectedCustomerId)
      : boats
    const match = candidates.find((b) => b.name.toLowerCase() === value.toLowerCase())
    if (match) {
      setSelectedBoatId(match.id)
      setRegistrationNumber(match.registrationNumber ?? '')
      setExistingEngines(match.engines)
      setNewEngines([])
      // Picking an existing boat pins the customer to its real owner, even if
      // a different (or no) customer was selected/typed beforehand.
      const owner = customers.find((c) => c.id === match.ownerId)
      if (owner) {
        setSelectedCustomerId(owner.id)
        setCustomerName(owner.name)
        setContactName(owner.contactName)
        setPhone(owner.phone)
      }
    } else {
      setSelectedBoatId(null)
      setRegistrationNumber('')
      setExistingEngines([])
      setNewEngines([{ ...emptyEngine }])
    }
  }

  function resetBoatSelection() {
    setSelectedBoatId(null)
    setBoatName('')
    setRegistrationNumber('')
    setExistingEngines([])
    setNewEngines([{ ...emptyEngine }])
  }

  function updateNewEngine(index: number, field: keyof EngineDraft, value: string) {
    setNewEngines((prev) => prev.map((engine, i) => (i === index ? { ...engine, [field]: value } : engine)))
  }

  function updateTask(index: number, value: string) {
    setTasks((prev) => prev.map((task, i) => (i === index ? value : task)))
  }

  const filledNewEngines = newEngines.filter(
    (e) => e.engineType.trim() && e.chassisNumber.trim() && e.propellerSerialNumber.trim(),
  )
  const filledTasks = tasks.map((t) => t.trim()).filter(Boolean)

  // A new engine row only half filled in used to be dropped without a word.
  const halfFilledEngine = newEngines.some((engine) => {
    const parts = [engine.engineType, engine.chassisNumber, engine.propellerSerialNumber].map((p) =>
      p.trim(),
    )
    return parts.some(Boolean) && !parts.every(Boolean)
  })

  // What's still missing, named as the form names it. The button stays
  // pressable on purpose: greyed out it didn't say why, and a form with no
  // phone number looked ready to go. Pressing it lists what's left and marks
  // those fields instead.
  const missing = useMemo(() => {
    const list: { field: RequiredField; label: string }[] = []
    if (!locationCode) list.push({ field: 'location', label: 'Localización' })
    if (!customerName.trim()) list.push({ field: 'customerName', label: 'Nombre de empresa/particular' })
    if (!selectedCustomerId && !contactName.trim()) {
      list.push({ field: 'contactName', label: 'Nombre del responsable' })
    }
    if (!selectedCustomerId && !phone.trim()) {
      list.push({ field: 'phone', label: 'Teléfono del responsable' })
    }
    if (!boatName.trim()) list.push({ field: 'boatName', label: 'Nombre de la embarcación/máquina' })
    if (!assetLocation.trim()) {
      list.push({ field: 'assetLocation', label: 'Ubicación de la embarcación/máquina' })
    }
    if (halfFilledEngine) {
      list.push({ field: 'engines', label: 'Un motor a medias: rellena sus tres datos o vacíalo' })
    } else if (existingEngines.length + filledNewEngines.length === 0) {
      list.push({ field: 'engines', label: 'Al menos un motor, con sus tres datos' })
    }
    if (filledTasks.length === 0) list.push({ field: 'tasks', label: 'Al menos un trabajo a realizar' })
    return list
  }, [
    locationCode,
    customerName,
    selectedCustomerId,
    contactName,
    phone,
    boatName,
    assetLocation,
    halfFilledEngine,
    existingEngines.length,
    filledNewEngines.length,
    filledTasks.length,
  ])

  function isMissing(field: RequiredField) {
    return showMissing && missing.some((m) => m.field === field)
  }

  function inputBorder(field: RequiredField) {
    return isMissing(field) ? 'border-red-400 bg-red-50' : 'border-slate-300'
  }

  async function handleSubmit() {
    if (missing.length > 0 || !locationCode) {
      setShowMissing(true)
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const { code, finalReportUrl } = await createWorkOrder({
        locationCode,
        customerId: selectedCustomerId ?? undefined,
        newCustomer: selectedCustomerId
          ? undefined
          : { name: customerName.trim(), contactName: contactName.trim(), phone: phone.trim() },
        customerLinkedUserId: customers.find((c) => c.id === selectedCustomerId)?.linkedUserId ?? undefined,
        boatId: selectedBoatId ?? undefined,
        newBoat: selectedBoatId
          ? undefined
          : { name: boatName.trim(), registrationNumber: registrationNumber.trim() || undefined },
        newEngines: filledNewEngines,
        assetLocation: assetLocation.trim(),
        description: comments.trim() || undefined,
        tasks: filledTasks,
        ...(fromAppointment ? { appointmentId: fromAppointment.id } : {}),
        pdfData: {
          customerName: customerName.trim(),
          contactName: contactName.trim(),
          phone: phone.trim(),
          boatName: boatName.trim(),
          registrationNumber: registrationNumber.trim() || undefined,
          engines: [...existingEngines, ...filledNewEngines],
          locationLabel: orderLocationLabel[locationCode],
        },
      })

      setSuccessReportUrl(finalReportUrl)
      setSuccessCode(code)
    } catch (err) {
      // The server's own sentences (the appointment was completed or deleted
      // meanwhile, say) are worth showing; a bare SDK code like "internal" isn't.
      const code = (err as { code?: unknown }).code
      const isServerSentence =
        err instanceof Error && typeof code === 'string' && err.message !== code.replace('functions/', '')
      setError(
        isServerSentence ? (err as Error).message : 'No se pudo crear la orden. Inténtalo de nuevo.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  if (successCode) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-4 text-center">
        <p className="text-lg font-semibold text-eb-blue-dark">
          Orden {successCode} creada correctamente
        </p>
        <p className="text-sm text-slate-500">
          El informe se ha guardado en Storage, carpeta{' '}
          <span className="font-mono">work-orders/{successCode}</span>.
        </p>
        {successReportUrl && (
          <a
            href={successReportUrl}
            target="_blank"
            rel="noreferrer"
            className="text-sm text-eb-blue underline"
          >
            Ver informe PDF
          </a>
        )}
        <button
          onClick={() => navigate(fromAppointment ? '/calendar' : '/')}
          className="rounded-lg bg-eb-blue px-4 py-2 text-sm font-semibold text-white"
        >
          {fromAppointment ? 'Volver al calendario' : 'Volver al panel'}
        </button>
      </div>
    )
  }

  return (
    <div className="flex-1 p-4">
      <BackButton to={fromAppointment ? '/calendar' : '/'} />
      <h1 className="text-lg font-semibold text-eb-blue-dark">Nueva orden de trabajo</h1>
      <p className="mt-0.5 text-xs text-slate-500">
        Los campos con <span className="text-red-600">*</span> son obligatorios.
      </p>
      {fromAppointment && (
        <p className="mt-2 rounded-lg border border-purple-200 bg-purple-50 px-3 py-2 text-xs text-purple-900">
          Datos traídos de la cita «{fromAppointment.title}». Revisa y completa lo que falta: al
          crear la orden, la cita quedará completada en el calendario, en morado. Si sales sin
          crearla, la cita sigue pendiente.
          {fromAppointment.externalCode &&
            ` La orden se creará con el nº de orden interno ${fromAppointment.externalCode}.`}
        </p>
      )}

      <section className="mt-4 rounded-xl border border-slate-200 bg-white/90 p-4 backdrop-blur-sm">
        <h2 className="text-sm font-semibold text-eb-teal-dark">
          Localización
          <RequiredMark />
        </h2>
        {isMissing('location') && (
          <p className="mt-1 text-xs text-red-600">Elige la localización de la orden.</p>
        )}
        <div className="mt-2 flex flex-wrap gap-2">
          {Object.values(OrderLocation).map((loc) => (
            <button
              key={loc}
              type="button"
              onClick={() => setLocationCode(loc)}
              className={`rounded-lg border px-3 py-2 text-sm ${
                locationCode === loc
                  ? 'border-eb-blue bg-eb-blue text-white'
                  : 'border-slate-300 text-slate-600'
              }`}
            >
              {orderLocationLabel[loc]}
            </button>
          ))}
        </div>
      </section>

      <section className="mt-4 rounded-xl border border-slate-200 bg-white/90 p-4 backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-eb-teal-dark">Cliente</h2>
          {selectedCustomerId && !selectedBoatId && (
            <button
              type="button"
              onClick={resetCustomerSelection}
              className="text-xs text-eb-blue underline"
            >
              Usar otro cliente
            </button>
          )}
        </div>

        {selectedBoatId && (
          <p className="mt-2 text-xs text-slate-500">
            Cliente determinado por la embarcación/máquina seleccionada. Para cambiarlo, usa
            "Usar otra embarcación/máquina" primero.
          </p>
        )}

        <label className="mt-2 block text-sm font-medium text-slate-600">
          Nombre de empresa/particular
          <RequiredMark />
          <input
            list="customer-names"
            value={customerName}
            disabled={!!selectedBoatId}
            onChange={(e) => handleCustomerNameChange(e.target.value)}
            className={`mt-1 w-full rounded-lg border ${inputBorder('customerName')} px-3 py-2 text-base outline-none focus:border-eb-blue disabled:bg-slate-100 disabled:text-slate-500`}
          />
          <datalist id="customer-names">
            {customers.map((c) => (
              <option key={c.id} value={c.name} />
            ))}
          </datalist>
        </label>

        <label className="mt-3 block text-sm font-medium text-slate-600">
          Nombre del responsable
          <RequiredMark />
          <input
            value={contactName}
            disabled={!!selectedCustomerId}
            onChange={(e) => setContactName(e.target.value)}
            className={`mt-1 w-full rounded-lg border ${inputBorder('contactName')} px-3 py-2 text-base outline-none focus:border-eb-blue disabled:bg-slate-100 disabled:text-slate-500`}
          />
        </label>

        <label className="mt-3 block text-sm font-medium text-slate-600">
          Teléfono del responsable
          <RequiredMark />
          <input
            value={phone}
            disabled={!!selectedCustomerId}
            onChange={(e) => setPhone(e.target.value)}
            className={`mt-1 w-full rounded-lg border ${inputBorder('phone')} px-3 py-2 text-base outline-none focus:border-eb-blue disabled:bg-slate-100 disabled:text-slate-500`}
          />
        </label>
      </section>

      <section className="mt-4 rounded-xl border border-slate-200 bg-white/90 p-4 backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-eb-teal-dark">Embarcación / máquina</h2>
          {selectedBoatId && (
            <button type="button" onClick={resetBoatSelection} className="text-xs text-eb-blue underline">
              Usar otra embarcación/máquina
            </button>
          )}
        </div>

        <label className="mt-2 block text-sm font-medium text-slate-600">
          Nombre
          <RequiredMark />
          <input
            list="boat-names"
            value={boatName}
            onChange={(e) => handleBoatNameChange(e.target.value)}
            className={`mt-1 w-full rounded-lg border ${inputBorder('boatName')} px-3 py-2 text-base outline-none focus:border-eb-blue`}
          />
          <datalist id="boat-names">
            {(selectedCustomerId
              ? boats.filter((b) => b.ownerId === selectedCustomerId)
              : boats
            ).map((b) => (
              <option key={b.id} value={b.name} />
            ))}
          </datalist>
        </label>
        {selectedCustomerId && !selectedBoatId && (
          <p className="mt-1 text-xs text-slate-500">
            {boats.some((b) => b.ownerId === selectedCustomerId)
              ? 'Solo se sugieren las embarcaciones/máquinas de este cliente. Escribe un nombre nuevo para registrar otra.'
              : 'Este cliente todavía no tiene embarcaciones/máquinas registradas.'}
          </p>
        )}

        <label className="mt-3 block text-sm font-medium text-slate-600">
          Matrícula (opcional)
          <input
            value={registrationNumber}
            disabled={!!selectedBoatId}
            onChange={(e) => setRegistrationNumber(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-base outline-none focus:border-eb-blue disabled:bg-slate-100 disabled:text-slate-500"
          />
        </label>

        <label className="mt-3 block text-sm font-medium text-slate-600">
          Ubicación de la embarcación/máquina
          <RequiredMark />
          <input
            value={assetLocation}
            onChange={(e) => setAssetLocation(e.target.value)}
            placeholder="Ej. Muelle 3, pantalán B"
            className={`mt-1 w-full rounded-lg border ${inputBorder('assetLocation')} px-3 py-2 text-base outline-none focus:border-eb-blue`}
          />
        </label>

        {existingEngines.length > 0 && (
          <div className="mt-4">
            <p className="text-xs font-medium text-slate-500">Motores ya registrados</p>
            <ul className="mt-1 space-y-1">
              {existingEngines.map((engine, i) => (
                <li key={i} className="rounded-lg bg-slate-50 p-2 text-xs text-slate-600">
                  {engine.engineType} · chasis {engine.chassisNumber} · propulsor{' '}
                  {engine.propellerSerialNumber}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-4">
          <p className="text-xs font-medium text-slate-500">
            {existingEngines.length > 0 ? 'Añadir motor nuevo' : 'Motores'}
            {existingEngines.length === 0 && <RequiredMark />}
          </p>
          {isMissing('engines') && (
            <p className="mt-1 text-xs text-red-600">
              {halfFilledEngine
                ? 'Hay un motor a medias: rellena tipo, nº chasis y nº serie del propulsor, o vacíalo.'
                : 'Añade al menos un motor con sus tres datos.'}
            </p>
          )}
          {newEngines.map((engine, i) => (
            <div key={i} className="mt-2 grid grid-cols-1 gap-2 rounded-lg border border-slate-200 p-3 sm:grid-cols-3">
              <input
                placeholder="Tipo de motor"
                value={engine.engineType}
                onChange={(e) => updateNewEngine(i, 'engineType', e.target.value)}
                className={`rounded-lg border ${inputBorder('engines')} px-2 py-1.5 text-sm outline-none focus:border-eb-blue`}
              />
              <input
                placeholder="Nº chasis del motor"
                value={engine.chassisNumber}
                onChange={(e) => updateNewEngine(i, 'chassisNumber', e.target.value)}
                className={`rounded-lg border ${inputBorder('engines')} px-2 py-1.5 text-sm outline-none focus:border-eb-blue`}
              />
              <input
                placeholder="Nº serie del propulsor"
                value={engine.propellerSerialNumber}
                onChange={(e) => updateNewEngine(i, 'propellerSerialNumber', e.target.value)}
                className={`rounded-lg border ${inputBorder('engines')} px-2 py-1.5 text-sm outline-none focus:border-eb-blue`}
              />
            </div>
          ))}
          <button
            type="button"
            onClick={() => setNewEngines((prev) => [...prev, { ...emptyEngine }])}
            className="mt-2 text-sm text-eb-blue"
          >
            + Añadir motor
          </button>
        </div>
      </section>

      <section className="mt-4 rounded-xl border border-slate-200 bg-white/90 p-4 backdrop-blur-sm">
        <h2 className="text-sm font-semibold text-eb-teal-dark">
          Trabajos a realizar
          <RequiredMark />
        </h2>
        {isMissing('tasks') && (
          <p className="mt-1 text-xs text-red-600">Escribe al menos un trabajo.</p>
        )}
        {tasks.map((task, i) => (
          <div key={i} className="mt-2 flex gap-2">
            <input
              value={task}
              onChange={(e) => updateTask(i, e.target.value)}
              placeholder={`Tarea ${i + 1}`}
              className={`flex-1 rounded-lg border ${inputBorder('tasks')} px-3 py-2 text-base outline-none focus:border-eb-blue`}
            />
            {tasks.length > 1 && (
              <button
                type="button"
                onClick={() => setTasks((prev) => prev.filter((_, idx) => idx !== i))}
                className="rounded-lg border border-slate-300 px-3 text-slate-500"
              >
                ✕
              </button>
            )}
          </div>
        ))}
        <button
          type="button"
          onClick={() => setTasks((prev) => [...prev, ''])}
          className="mt-2 text-sm text-eb-blue"
        >
          + Añadir tarea
        </button>
      </section>

      <section className="mt-4 rounded-xl border border-slate-200 bg-white/90 p-4 backdrop-blur-sm">
        <label className="block text-sm font-semibold text-eb-teal-dark">
          Comentarios adicionales
          <textarea
            value={comments}
            onChange={(e) => setComments(e.target.value)}
            rows={3}
            className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-base outline-none focus:border-eb-blue"
          />
        </label>
      </section>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      {showMissing && missing.length > 0 && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <p className="font-semibold">Falta por rellenar:</p>
          <ul className="mt-1 list-disc pl-5">
            {missing.map((m) => (
              <li key={m.label}>{m.label}</li>
            ))}
          </ul>
        </div>
      )}

      <button
        type="button"
        disabled={submitting}
        onClick={handleSubmit}
        className="mt-6 w-full rounded-lg bg-eb-teal py-3 text-base font-semibold text-white transition-colors hover:bg-eb-teal-dark disabled:opacity-50"
      >
        {submitting ? 'Creando orden...' : 'Crear orden'}
      </button>
    </div>
  )
}
