import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  OrderLocation,
  listBoats,
  listCustomers,
  type ListBoatsData,
  type ListCustomersData,
} from '@dataconnect/generated'
import { BackButton } from '../components/BackButton'
import { SignaturePad, type SignaturePadHandle } from '../components/SignaturePad'
import { FRESH } from '../lib/dataConnectOptions'
import { createIntervention } from '../lib/intervention'
import { orderLocationLabel } from '../lib/orderCode'

const CONSENT_CLAUSES = [
  {
    title: '1. Solicitud de presupuesto',
    body: 'En caso de solicitar presupuesto, si el cliente no realiza seguidamente la reparación en nuestro taller, ELIAS BLANCO S.L. procederá a facturar el coste de elaboración de dicho presupuesto, que será de 70€.',
  },
  {
    title: '2. Autorización',
    body: 'El cliente autoriza al personal de ELIAS BLANCO S.L. con la capacitación pertinente a realizar las pruebas de mar y/o terrestres necesarias para la correcta diagnosis y comprobación del equipo, declarando expresamente que el seguro y demás documentación de la embarcación, vehículo y/o máquina se encuentra en vigor. De no ser así, se hará responsable de los daños y perjuicios ocasionados por no estar en vigor. Del mismo modo, el cliente autoriza la instalación y sustitución de las piezas necesarias y la realización de todos los trabajos necesarios para la correcta reparación.',
  },
  {
    title: '3. Piezas y elementos sustituidos',
    body: 'Si el cliente desea las piezas, elementos y conjuntos sustituidos en la reparación, dispone de 10 días para retirarlos de nuestro taller una vez terminados los trabajos y abonada la factura correspondiente. A partir del 11º día se facturará a razón de 15€/día si el volumen de la pieza es inferior a 0,5m³ y 25€/día si es superior. A partir del día 30, si no se han recogido las piezas, estas pasan a libre disposición de ELIAS BLANCO, S.L.',
  },
  {
    title: '4. Entrega a cuenta',
    body: 'El cliente autoriza expresamente a ELIAS BLANCO S.L. a la utilización de repuestos, elementos, equipos o conjuntos originales, haciéndose responsable el taller del buen estado de los mismos y ofreciendo la garantía legal aplicable. Si el repuesto no es original por cualquier causa, el cliente será informado convenientemente. Para el comienzo de las operaciones de reparación y/o pedido de material se deberá abonar el 50% del presupuesto por adelantado y el otro 50% a la finalización del trabajo y/o entrega del material.',
  },
  {
    title: '5. Firma',
    body: 'La firma de la presente orden de reparación conlleva la aceptación de los cuatro puntos anteriores y las cláusulas y condiciones de prestación de servicio que aparecen al dorso del documento físico.',
  },
]

export function InterventionPage() {
  const navigate = useNavigate()
  const signaturePadRef = useRef<SignaturePadHandle>(null)

  const [customers, setCustomers] = useState<ListCustomersData['customers']>([])
  const [boats, setBoats] = useState<ListBoatsData['boats']>([])

  const [locationCode, setLocationCode] = useState<OrderLocation | ''>('')

  const [customerName, setCustomerName] = useState('')
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null)
  const [contactName, setContactName] = useState('')
  const [phone, setPhone] = useState('')

  const [boatName, setBoatName] = useState('')
  const [selectedBoatId, setSelectedBoatId] = useState<string | null>(null)
  const [registrationNumber, setRegistrationNumber] = useState('')
  const [manufacturerModel, setManufacturerModel] = useState('')
  const [loaMeters, setLoaMeters] = useState('')
  const [beamMeters, setBeamMeters] = useState('')

  const [expectedDeliveryAt, setExpectedDeliveryAt] = useState('')
  const [homePort, setHomePort] = useState('')
  const [pier, setPier] = useState('')
  const [berthPosition, setBerthPosition] = useState('')
  const [engineComponentInfo, setEngineComponentInfo] = useState('')

  const [keysLeft, setKeysLeft] = useState<boolean | null>(null)
  const [wantsQuoteFirst, setWantsQuoteFirst] = useState<boolean | null>(null)

  const [requestedWork, setRequestedWork] = useState('')
  const [observations, setObservations] = useState('')

  const [hasSignature, setHasSignature] = useState(false)

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successCode, setSuccessCode] = useState<string | null>(null)

  useEffect(() => {
    listCustomers(FRESH).then((res) => setCustomers(res.data.customers))
    listBoats(FRESH).then((res) => setBoats(res.data.boats))
  }, [])

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
    const candidates = selectedCustomerId ? boats.filter((b) => b.ownerId === selectedCustomerId) : boats
    const match = candidates.find((b) => b.name.toLowerCase() === value.toLowerCase())
    if (match) {
      setSelectedBoatId(match.id)
      setRegistrationNumber(match.registrationNumber ?? '')
      setManufacturerModel(match.manufacturerModel ?? '')
      setLoaMeters(match.loaMeters != null ? String(match.loaMeters) : '')
      setBeamMeters(match.beamMeters != null ? String(match.beamMeters) : '')
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
      setManufacturerModel('')
      setLoaMeters('')
      setBeamMeters('')
    }
  }

  function resetBoatSelection() {
    setSelectedBoatId(null)
    setBoatName('')
    setRegistrationNumber('')
    setManufacturerModel('')
    setLoaMeters('')
    setBeamMeters('')
  }

  const canSubmit = useMemo(() => {
    if (!locationCode) return false
    if (!customerName.trim()) return false
    if (!selectedCustomerId && (!contactName.trim() || !phone.trim())) return false
    if (!boatName.trim()) return false
    if (keysLeft === null) return false
    if (wantsQuoteFirst === null) return false
    if (!requestedWork.trim()) return false
    if (!hasSignature) return false
    return true
  }, [
    locationCode,
    customerName,
    selectedCustomerId,
    contactName,
    phone,
    boatName,
    keysLeft,
    wantsQuoteFirst,
    requestedWork,
    hasSignature,
  ])

  async function handleSubmit() {
    if (!canSubmit || !locationCode || keysLeft === null || wantsQuoteFirst === null) return
    if (signaturePadRef.current?.isEmpty()) return
    setSubmitting(true)
    setError(null)
    try {
      const { code } = await createIntervention({
        locationCode,
        customerId: selectedCustomerId ?? undefined,
        newCustomer: selectedCustomerId
          ? undefined
          : { name: customerName.trim(), contactName: contactName.trim(), phone: phone.trim() },
        boatId: selectedBoatId ?? undefined,
        newBoat: selectedBoatId
          ? undefined
          : {
              name: boatName.trim(),
              registrationNumber: registrationNumber.trim() || undefined,
              manufacturerModel: manufacturerModel.trim() || undefined,
              loaMeters: loaMeters.trim() ? Number(loaMeters) : undefined,
              beamMeters: beamMeters.trim() ? Number(beamMeters) : undefined,
            },
        expectedDeliveryAt: expectedDeliveryAt || undefined,
        homePort: homePort.trim() || undefined,
        pier: pier.trim() || undefined,
        berthPosition: berthPosition.trim() || undefined,
        engineComponentInfo: engineComponentInfo.trim() || undefined,
        keysLeft,
        wantsQuoteFirst,
        requestedWork: requestedWork.trim(),
        observations: observations.trim() || undefined,
        signaturePngBase64: signaturePadRef.current!.toBase64Png(),
      })
      setSuccessCode(code)
    } catch {
      setError('No se pudo crear la orden de intervención. Inténtalo de nuevo.')
    } finally {
      setSubmitting(false)
    }
  }

  if (successCode) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-4 text-center">
        <p className="text-lg font-semibold text-eb-blue-dark">
          Orden de intervención {successCode} creada correctamente
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => navigate('/')}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600"
          >
            Volver al panel
          </button>
          <button
            onClick={() => navigate('/interventions')}
            className="rounded-lg bg-eb-blue px-4 py-2 text-sm font-semibold text-white"
          >
            Ver lista
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 p-4">
      <BackButton to="/" />
      <h1 className="text-lg font-semibold text-eb-blue-dark">Orden de intervención</h1>
      <p className="text-sm text-slate-500">
        Recepción en mostrador - datos del cliente, la embarcación/máquina y el consentimiento.
      </p>

      <section className="mt-4 rounded-xl border border-slate-200 bg-white/90 p-4 backdrop-blur-sm">
        <h2 className="text-sm font-semibold text-eb-teal-dark">Localización</h2>
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

        <label className="mt-2 block text-sm font-medium text-slate-600">
          Nombre de empresa/particular
          <input
            list="customer-names"
            value={customerName}
            disabled={!!selectedBoatId}
            onChange={(e) => handleCustomerNameChange(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-base outline-none focus:border-eb-blue disabled:bg-slate-100 disabled:text-slate-500"
          />
          <datalist id="customer-names">
            {customers.map((c) => (
              <option key={c.id} value={c.name} />
            ))}
          </datalist>
        </label>

        <label className="mt-3 block text-sm font-medium text-slate-600">
          Nombre del responsable
          <input
            value={contactName}
            disabled={!!selectedCustomerId}
            onChange={(e) => setContactName(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-base outline-none focus:border-eb-blue disabled:bg-slate-100 disabled:text-slate-500"
          />
        </label>

        <label className="mt-3 block text-sm font-medium text-slate-600">
          Teléfono del responsable
          <input
            value={phone}
            disabled={!!selectedCustomerId}
            onChange={(e) => setPhone(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-base outline-none focus:border-eb-blue disabled:bg-slate-100 disabled:text-slate-500"
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
          <input
            list="boat-names"
            value={boatName}
            onChange={(e) => handleBoatNameChange(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-base outline-none focus:border-eb-blue"
          />
          <datalist id="boat-names">
            {(selectedCustomerId ? boats.filter((b) => b.ownerId === selectedCustomerId) : boats).map((b) => (
              <option key={b.id} value={b.name} />
            ))}
          </datalist>
        </label>

        <label className="mt-3 block text-sm font-medium text-slate-600">
          Astillero - Fabricante - Modelo
          <input
            value={manufacturerModel}
            disabled={!!selectedBoatId}
            onChange={(e) => setManufacturerModel(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-base outline-none focus:border-eb-blue disabled:bg-slate-100 disabled:text-slate-500"
          />
        </label>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <label className="block text-sm font-medium text-slate-600">
            Matrícula
            <input
              value={registrationNumber}
              disabled={!!selectedBoatId}
              onChange={(e) => setRegistrationNumber(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-base outline-none focus:border-eb-blue disabled:bg-slate-100 disabled:text-slate-500"
            />
          </label>
          <label className="block text-sm font-medium text-slate-600">
            Eslora (m)
            <input
              type="number"
              step="0.01"
              value={loaMeters}
              disabled={!!selectedBoatId}
              onChange={(e) => setLoaMeters(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-base outline-none focus:border-eb-blue disabled:bg-slate-100 disabled:text-slate-500"
            />
          </label>
        </div>

        <label className="mt-3 block text-sm font-medium text-slate-600">
          Manga (m)
          <input
            type="number"
            step="0.01"
            value={beamMeters}
            disabled={!!selectedBoatId}
            onChange={(e) => setBeamMeters(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-base outline-none focus:border-eb-blue disabled:bg-slate-100 disabled:text-slate-500"
          />
        </label>
      </section>

      <section className="mt-4 rounded-xl border border-slate-200 bg-white/90 p-4 backdrop-blur-sm">
        <h2 className="text-sm font-semibold text-eb-teal-dark">Localización exacta</h2>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <input
            placeholder="Puerto base - Localización"
            value={homePort}
            onChange={(e) => setHomePort(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-eb-blue"
          />
          <input
            placeholder="Pantalán - Ubicación"
            value={pier}
            onChange={(e) => setPier(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-eb-blue"
          />
          <input
            placeholder="Atraque / Posición"
            value={berthPosition}
            onChange={(e) => setBerthPosition(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-eb-blue"
          />
        </div>
        <label className="mt-3 block text-sm font-medium text-slate-600">
          Motor - Componente - Hélice
          <input
            value={engineComponentInfo}
            onChange={(e) => setEngineComponentInfo(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-base outline-none focus:border-eb-blue"
          />
        </label>
      </section>

      <section className="mt-4 rounded-xl border border-slate-200 bg-white/90 p-4 backdrop-blur-sm">
        <h2 className="text-sm font-semibold text-eb-teal-dark">Opciones</h2>

        <p className="mt-2 text-sm font-medium text-slate-600">Llaves</p>
        <div className="mt-1 flex gap-2">
          {[
            { label: 'Sí', value: true },
            { label: 'No', value: false },
          ].map((opt) => (
            <button
              key={String(opt.value)}
              type="button"
              onClick={() => setKeysLeft(opt.value)}
              className={`rounded-lg border px-4 py-2 text-sm ${
                keysLeft === opt.value
                  ? 'border-eb-blue bg-eb-blue text-white'
                  : 'border-slate-300 text-slate-600'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <p className="mt-4 text-sm font-medium text-slate-600">Presupuesto</p>
        <div className="mt-1 flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={() => setWantsQuoteFirst(true)}
            className={`flex-1 rounded-lg border px-4 py-2 text-left text-sm ${
              wantsQuoteFirst === true
                ? 'border-eb-blue bg-eb-blue text-white'
                : 'border-slate-300 text-slate-600'
            }`}
          >
            Presupuesto primero
          </button>
          <button
            type="button"
            onClick={() => setWantsQuoteFirst(false)}
            className={`flex-1 rounded-lg border px-4 py-2 text-left text-sm ${
              wantsQuoteFirst === false
                ? 'border-eb-blue bg-eb-blue text-white'
                : 'border-slate-300 text-slate-600'
            }`}
          >
            Reparación directa (renuncia al presupuesto)
          </button>
        </div>

        <label className="mt-4 block text-sm font-medium text-slate-600">
          Fecha prevista de entrega (opcional)
          <input
            type="date"
            value={expectedDeliveryAt}
            onChange={(e) => setExpectedDeliveryAt(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-base outline-none focus:border-eb-blue"
          />
        </label>
      </section>

      <section className="mt-4 rounded-xl border border-slate-200 bg-white/90 p-4 backdrop-blur-sm">
        <label className="block text-sm font-semibold text-eb-teal-dark">
          Trabajos solicitados
          <textarea
            value={requestedWork}
            onChange={(e) => setRequestedWork(e.target.value)}
            rows={3}
            className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-base outline-none focus:border-eb-blue"
          />
        </label>
        <label className="mt-3 block text-sm font-semibold text-eb-teal-dark">
          Observaciones
          <textarea
            value={observations}
            onChange={(e) => setObservations(e.target.value)}
            rows={3}
            className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-base outline-none focus:border-eb-blue"
          />
        </label>
      </section>

      <section className="mt-4 rounded-xl border border-slate-200 bg-white/90 p-4 backdrop-blur-sm">
        <h2 className="text-sm font-semibold text-eb-teal-dark">Condiciones y consentimiento</h2>
        <div className="mt-2 space-y-3">
          {CONSENT_CLAUSES.map((clause) => (
            <div key={clause.title}>
              <p className="text-xs font-semibold text-slate-700">{clause.title}</p>
              <p className="mt-0.5 text-xs text-slate-500">{clause.body}</p>
            </div>
          ))}
        </div>

        <p className="mt-4 text-sm font-medium text-slate-600">Firma del cliente</p>
        <div className="mt-1">
          <SignaturePad ref={signaturePadRef} onEmptyChange={(empty) => setHasSignature(!empty)} />
        </div>
      </section>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      <button
        type="button"
        disabled={!canSubmit || submitting}
        onClick={handleSubmit}
        className="mt-6 w-full rounded-lg bg-eb-teal py-3 text-base font-semibold text-white transition-colors hover:bg-eb-teal-dark disabled:opacity-50"
      >
        {submitting ? 'Creando...' : 'Crear orden de intervención'}
      </button>
    </div>
  )
}
