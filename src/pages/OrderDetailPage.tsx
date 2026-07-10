import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import {
  MediaType,
  OrderEventType,
  PhotoStage,
  QuoteDecision,
  UserRole,
  WorkOrderStatus,
  assignTechnician,
  clockIn,
  clockOut,
  completeWorkOrder,
  createIncident,
  createQuote,
  createWorkOrderPhoto,
  decideQuote,
  getMyActiveTimeLog,
  getWorkOrderDetail,
  listAssignableUsers,
  logOrderEvent,
  startWorkOrder,
  unassignTechnician,
  updateWorkOrderStatus,
  type GetMyActiveTimeLogData,
  type GetWorkOrderDetailData,
  type ListAssignableUsersData,
} from '@dataconnect/generated'
import { BackButton } from '../components/BackButton'
import { HasPermission } from '../components/HasPermission'
import { PdfViewer } from '../components/PdfViewer'
import { useAuth } from '../contexts/AuthContext'
import { usePermission } from '../hooks/usePermission'
import { setChatParticipants } from '../lib/chat'
import { FRESH } from '../lib/dataConnectOptions'
import { mediaTypeOf, validateMediaFile } from '../lib/media'
import { orderLocationLabel } from '../lib/orderCode'
import { orderEventTypeLabel } from '../lib/orderEvent'
import { workOrderStatusLabel } from '../lib/orderStatus'
import { uploadWorkOrderPhoto } from '../lib/photoStorage'
import { sendPushNotification } from '../lib/pushNotifications'
import { uploadQuotePdf } from '../lib/quoteStorage'

type WorkOrder = NonNullable<GetWorkOrderDetailData['workOrder']>
type AssignableUser = ListAssignableUsersData['users'][number]
type ActiveTimeLog = GetMyActiveTimeLogData['timeLogs'][number]

function durationMinutesSince(clockInAt: string) {
  return Math.round((Date.now() - new Date(clockInAt).getTime()) / 60000)
}

function isAssignableUser(user: AssignableUser) {
  return (
    user.role === UserRole.TECHNICIAN ||
    user.userPermissions.some((up) => up.permission.key === 'orders:assignable')
  )
}

interface AssignmentFlags {
  isAllowed: boolean
  isLead: boolean
}

function TechnicianAssignModal({
  order,
  onClose,
  onSaved,
}: {
  order: WorkOrder
  onClose: () => void
  onSaved: () => void
}) {
  const [users, setUsers] = useState<AssignableUser[] | null>(null)
  const initialSelection = useMemo(
    () =>
      new Map(
        order.assignments.map((a) => [
          a.technicianId,
          { isAllowed: a.isAllowed, isLead: a.isLead },
        ]),
      ),
    [order],
  )
  const [selected, setSelected] = useState<Map<string, AssignmentFlags>>(initialSelection)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState<{ assigned: number; unassigned: number } | null>(null)

  useEffect(() => {
    listAssignableUsers(FRESH).then((res) => setUsers(res.data.users.filter(isAssignableUser)))
  }, [])

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Map(prev)
      if (next.has(id)) next.delete(id)
      else next.set(id, { isAllowed: false, isLead: false })
      return next
    })
  }

  // Being the order's lead implies being authorized to start/finish it, so
  // isAllowed can't be unchecked while isLead is on.
  function setFlag(id: string, flag: keyof AssignmentFlags, value: boolean) {
    setSelected((prev) => {
      const current = prev.get(id)
      if (!current) return prev
      if (flag === 'isAllowed' && !value && current.isLead) return prev
      const next = new Map(prev)
      next.set(id, flag === 'isLead' && value ? { isAllowed: true, isLead: true } : { ...current, [flag]: value })
      return next
    })
  }

  const canSubmit = selected.size > 0

  async function handleConfirm() {
    setSubmitting(true)
    try {
      const initialIds = new Set(initialSelection.keys())
      const toUnassign = [...initialIds].filter((id) => !selected.has(id))
      const newlyAssigned = [...selected.keys()].filter((id) => !initialIds.has(id))

      for (const [technicianId, flags] of selected) {
        await assignTechnician({ workOrderId: order.id, technicianId, ...flags })
      }
      for (const technicianId of toUnassign) {
        await unassignTechnician({ workOrderId: order.id, technicianId })
      }
      if (newlyAssigned.length > 0) {
        await logOrderEvent({
          workOrderId: order.id,
          eventType: OrderEventType.TECHNICIANS_ASSIGNED,
          metadata: { technicianIds: newlyAssigned },
        })
        sendPushNotification({
          userIds: newlyAssigned,
          title: 'Nueva asignación',
          body: `Has sido asignado a la orden ${order.code}`,
          orderId: order.id,
        }).catch(() => {})
      }
      if (toUnassign.length > 0) {
        await logOrderEvent({
          workOrderId: order.id,
          eventType: OrderEventType.TECHNICIAN_UNASSIGNED,
          metadata: { technicianIds: toUnassign },
        })
      }
      await updateWorkOrderStatus({
        id: order.id,
        status: WorkOrderStatus.ASSIGNED,
        quoteAttempts: order.quoteAttempts,
      })
      await setChatParticipants('technicians', order.id, [...selected.keys()])
      setSubmitted({ assigned: newlyAssigned.length, unassigned: toUnassign.length })
    } finally {
      setSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-4 sm:items-center">
        <div className="w-full max-w-sm rounded-xl bg-white p-4 shadow-xl">
          <h2 className="text-sm font-semibold text-eb-teal-dark">✓ Técnicos asignados</h2>
          <p className="mt-2 text-sm text-slate-700">
            {submitted.assigned > 0 &&
              `${submitted.assigned} técnico${submitted.assigned === 1 ? '' : 's'} asignado${submitted.assigned === 1 ? '' : 's'} correctamente.`}
            {submitted.assigned > 0 && submitted.unassigned > 0 && ' '}
            {submitted.unassigned > 0 &&
              `${submitted.unassigned} técnico${submitted.unassigned === 1 ? '' : 's'} desasignado${submitted.unassigned === 1 ? '' : 's'}.`}
          </p>
          <button
            onClick={onSaved}
            className="mt-4 w-full rounded-lg bg-eb-blue py-2 text-sm font-semibold text-white"
          >
            Cerrar
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-4 sm:items-center">
      <div className="w-full max-w-sm rounded-xl bg-white p-4 shadow-xl">
        <h2 className="text-sm font-semibold text-eb-blue-dark">Asignar técnicos</h2>
        <p className="mt-1 text-xs text-slate-500">
          Técnicos y jefes de equipo disponibles para esta orden. "Autorizado" y "Jefe de la
          orden" pueden empezar y terminar la orden; los técnicos normales solo trabajan en ella y
          registran incidencias.
        </p>

        <div className="mt-3 max-h-72 space-y-1 overflow-y-auto">
          {users === null && <p className="text-sm text-slate-500">Cargando...</p>}
          {users?.length === 0 && (
            <p className="text-sm text-slate-500">No hay técnicos asignables.</p>
          )}
          {users?.map((user) => {
            const flags = selected.get(user.id)
            return (
              <div key={user.id} className="rounded-lg border border-slate-200 px-3 py-2">
                <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={!!flags}
                    onChange={() => toggle(user.id)}
                  />
                  {user.displayName}
                  {user.role === UserRole.ADMIN && (
                    <span className="ml-auto text-xs text-slate-400">Jefe de equipo</span>
                  )}
                </label>
                {flags && (
                  <div className="mt-2 flex gap-3 pl-6 text-xs text-slate-600">
                    <label
                      className={`flex items-center gap-1 ${flags.isLead ? 'opacity-50' : 'cursor-pointer'}`}
                    >
                      <input
                        type="checkbox"
                        checked={flags.isAllowed}
                        disabled={flags.isLead}
                        onChange={(e) => setFlag(user.id, 'isAllowed', e.target.checked)}
                      />
                      Autorizado
                    </label>
                    <label className="flex cursor-pointer items-center gap-1">
                      <input
                        type="checkbox"
                        checked={flags.isLead}
                        onChange={(e) => setFlag(user.id, 'isLead', e.target.checked)}
                      />
                      Jefe de la orden
                    </label>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <div className="mt-4 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 rounded-lg border border-slate-300 py-2 text-sm text-slate-600"
          >
            Cancelar
          </button>
          <button
            disabled={!canSubmit || submitting}
            onClick={handleConfirm}
            className="flex-1 rounded-lg bg-eb-blue py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {submitting ? 'Guardando...' : 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  )
}

/** Shared photo/video picker with size/duration validation (see lib/media.ts). */
function MediaPicker({
  files,
  onFilesChange,
}: {
  files: File[]
  onFilesChange: (files: File[]) => void
}) {
  const [validating, setValidating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleFilesSelected(e: ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? [])
    e.target.value = ''
    setValidating(true)
    setError(null)
    try {
      const errors: string[] = []
      const valid: File[] = []
      for (const file of picked) {
        const err = await validateMediaFile(file)
        if (err) errors.push(err)
        else valid.push(file)
      }
      setError(errors.length > 0 ? errors.join(' · ') : null)
      if (valid.length > 0) onFilesChange([...files, ...valid])
    } finally {
      setValidating(false)
    }
  }

  return (
    <div>
      <label className="mt-3 block cursor-pointer rounded-lg border-2 border-dashed border-slate-300 p-4 text-center text-sm text-eb-blue">
        {validating ? 'Comprobando archivo...' : '+ Elegir fotos o vídeos de la galería'}
        <input
          type="file"
          accept="image/*,video/*"
          multiple
          disabled={validating}
          className="hidden"
          onChange={handleFilesSelected}
        />
      </label>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      {files.length > 0 && (
        <ul className="mt-3 space-y-1">
          {files.map((file, i) => (
            <li
              key={i}
              className="flex items-center justify-between rounded-lg bg-slate-50 px-2 py-1.5 text-xs text-slate-600"
            >
              <span className="truncate">{file.name}</span>
              <button
                onClick={() => onFilesChange(files.filter((_, idx) => idx !== i))}
                className="ml-2 text-slate-400"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function IncidentModal({
  workOrderId,
  code,
  onClose,
  onSaved,
}: {
  workOrderId: string
  code: string
  onClose: () => void
  onSaved: () => void
}) {
  const [description, setDescription] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit() {
    setSubmitting(true)
    try {
      const incidentRes = await createIncident({ workOrderId, description: description.trim() })
      const incidentId = incidentRes.data.incident_insert.id
      for (const file of files) {
        const storageUrl = await uploadWorkOrderPhoto(code, 'incident', file)
        await createWorkOrderPhoto({
          workOrderId,
          stage: PhotoStage.INCIDENT,
          storageUrl,
          mediaType: mediaTypeOf(file),
          incidentId,
        })
      }
      await logOrderEvent({
        workOrderId,
        eventType: OrderEventType.INCIDENT_REPORTED,
        metadata: { description: description.trim() },
      })
      if (files.length > 0) {
        await logOrderEvent({
          workOrderId,
          eventType: OrderEventType.PHOTO_UPLOADED,
          metadata: { stage: PhotoStage.INCIDENT, count: files.length },
        })
      }
      onSaved()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-4 sm:items-center">
      <div className="w-full max-w-sm rounded-xl bg-white p-4 shadow-xl">
        <h2 className="text-sm font-semibold text-eb-blue-dark">Añadir incidencia</h2>
        <p className="mt-1 text-xs text-slate-500">
          Describe algo sucedido fuera de lo presupuestado.
        </p>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 outline-none focus:border-eb-blue"
          placeholder="Descripción de la incidencia"
        />

        <p className="mt-3 text-xs font-medium text-slate-500">Fotos o vídeos (opcional)</p>
        <MediaPicker files={files} onFilesChange={setFiles} />

        <div className="mt-4 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 rounded-lg border border-slate-300 py-2 text-sm text-slate-600"
          >
            Cancelar
          </button>
          <button
            disabled={!description.trim() || submitting}
            onClick={handleSubmit}
            className="flex-1 rounded-lg bg-eb-blue py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {submitting ? 'Guardando...' : 'Registrar'}
          </button>
        </div>
      </div>
    </div>
  )
}

const photoStageLabel: Record<PhotoStage, string> = {
  [PhotoStage.START]: 'Inicio',
  [PhotoStage.INCIDENT]: 'Incidencia',
  [PhotoStage.FINAL]: 'Final',
}

const photoModalCopy = {
  [PhotoStage.START]: {
    title: 'Fotos antes de empezar',
    subtitle: 'Sube al menos 1 foto o vídeo del estado actual antes de iniciar la orden.',
    confirmLabel: 'Empezar orden',
  },
  [PhotoStage.FINAL]: {
    title: 'Fotos finales',
    subtitle: 'Sube al menos 1 foto o vídeo del resultado antes de terminar la orden.',
    confirmLabel: 'Terminar orden',
  },
} as const

function PhotoUploadModal({
  stage,
  onClose,
  onConfirm,
}: {
  stage: typeof PhotoStage.START | typeof PhotoStage.FINAL
  onClose: () => void
  onConfirm: (files: File[]) => Promise<void>
}) {
  const [files, setFiles] = useState<File[]>([])
  const [submitting, setSubmitting] = useState(false)
  const copy = photoModalCopy[stage]

  async function handleConfirm() {
    setSubmitting(true)
    try {
      await onConfirm(files)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-4 sm:items-center">
      <div className="w-full max-w-sm rounded-xl bg-white p-4 shadow-xl">
        <h2 className="text-sm font-semibold text-eb-blue-dark">{copy.title}</h2>
        <p className="mt-1 text-xs text-slate-500">{copy.subtitle}</p>

        <MediaPicker files={files} onFilesChange={setFiles} />

        <div className="mt-4 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 rounded-lg border border-slate-300 py-2 text-sm text-slate-600"
          >
            Cancelar
          </button>
          <button
            disabled={files.length === 0 || submitting}
            onClick={handleConfirm}
            className="flex-1 rounded-lg bg-eb-blue py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {submitting ? 'Subiendo...' : copy.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

export function OrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const location = useLocation()
  const navigate = useNavigate()
  const routerState = location.state as { from?: string; autoAssign?: boolean } | null
  const backTo = routerState?.from ?? '/orders'
  const autoAssignTriggered = useRef(false)
  const { profile } = useAuth()
  const canViewQuotes = usePermission('quotes:upload') || usePermission('quotes:approve')
  const [order, setOrder] = useState<WorkOrder | null | undefined>(undefined)
  const [myActiveLog, setMyActiveLog] = useState<ActiveTimeLog | null>(null)
  const [assigning, setAssigning] = useState(false)
  const [reportingIncident, setReportingIncident] = useState(false)
  const [startingOrder, setStartingOrder] = useState(false)
  const [completingOrder, setCompletingOrder] = useState(false)
  const [busy, setBusy] = useState(false)
  const quoteFileInputRef = useRef<HTMLInputElement>(null)

  const loadOrder = useCallback(async () => {
    if (!id) return
    const res = await getWorkOrderDetail({ id }, FRESH)
    setOrder(res.data.workOrder)
  }, [id])

  const loadMyActiveLog = useCallback(async () => {
    const res = await getMyActiveTimeLog(FRESH)
    setMyActiveLog(res.data.timeLogs[0] ?? null)
  }, [])

  useEffect(() => {
    loadOrder()
    loadMyActiveLog()
  }, [loadOrder, loadMyActiveLog])

  // Lab "quick test order" shortcut on the dashboard drops straight into
  // this modal instead of making QA click "Asignar técnicos" separately.
  useEffect(() => {
    if (
      routerState?.autoAssign &&
      !autoAssignTriggered.current &&
      order?.status === WorkOrderStatus.AWAITING_ASSIGNMENT
    ) {
      autoAssignTriggered.current = true
      setAssigning(true)
    }
  }, [order, routerState?.autoAssign])

  async function handleAddQuote(file: Blob) {
    if (!order) return
    setBusy(true)
    try {
      const quoteAttempts = order.quoteAttempts + 1
      const fileUrl = await uploadQuotePdf(order.code, quoteAttempts, file)
      await createQuote({ workOrderId: order.id, attemptNumber: quoteAttempts, fileUrl })
      await updateWorkOrderStatus({
        id: order.id,
        status: WorkOrderStatus.PENDING_QUOTE,
        quoteAttempts,
      })
      await logOrderEvent({
        workOrderId: order.id,
        eventType: OrderEventType.QUOTE_UPLOADED,
        metadata: { attemptNumber: quoteAttempts },
      })
      await loadOrder()
    } finally {
      setBusy(false)
    }
  }

  function handleQuoteFileSelected(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (file) handleAddQuote(file)
  }

  async function handleAddQuoteLab() {
    const { createBlankPdfBlob } = await import('../lib/pdf/blankPdf')
    const blob = await createBlankPdfBlob()
    await handleAddQuote(blob)
  }

  async function handleAcceptQuote() {
    if (!order) return
    setBusy(true)
    try {
      const latestQuote = order.quotes[order.quotes.length - 1]
      if (latestQuote) {
        await decideQuote({ id: latestQuote.id, decision: QuoteDecision.ACCEPTED })
      }
      await updateWorkOrderStatus({
        id: order.id,
        status: WorkOrderStatus.AWAITING_ASSIGNMENT,
        quoteAttempts: order.quoteAttempts,
      })
      await logOrderEvent({ workOrderId: order.id, eventType: OrderEventType.QUOTE_ACCEPTED })
      await loadOrder()
    } finally {
      setBusy(false)
    }
  }

async function uploadOrderPhotos(
    order: WorkOrder,
    stage: typeof PhotoStage.START | typeof PhotoStage.FINAL,
    files: File[],
  ) {
    const storageStage = stage === PhotoStage.START ? 'start' : 'final'
    for (const file of files) {
      const storageUrl = await uploadWorkOrderPhoto(order.code, storageStage, file)
      await createWorkOrderPhoto({
        workOrderId: order.id,
        stage,
        storageUrl,
        mediaType: mediaTypeOf(file),
      })
    }
    await logOrderEvent({
      workOrderId: order.id,
      eventType: OrderEventType.PHOTO_UPLOADED,
      metadata: { stage, count: files.length },
    })
  }

  async function handleStartOrder(files: File[]) {
    if (!order) return
    setBusy(true)
    try {
      await uploadOrderPhotos(order, PhotoStage.START, files)
      await startWorkOrder({ id: order.id })
      await logOrderEvent({ workOrderId: order.id, eventType: OrderEventType.WORK_STARTED })
      setStartingOrder(false)
      await loadOrder()
    } finally {
      setBusy(false)
    }
  }

  async function handleCompleteOrder(files: File[]) {
    if (!order) return
    setBusy(true)
    try {
      await uploadOrderPhotos(order, PhotoStage.FINAL, files)
      const activeLogs = order.timeLogs.filter((log) => !log.clockOut)
      for (const log of activeLogs) {
        await clockOut({ timeLogId: log.id, durationMinutes: durationMinutesSince(log.clockIn) })
      }
      await completeWorkOrder({ id: order.id })
      await logOrderEvent({ workOrderId: order.id, eventType: OrderEventType.ORDER_COMPLETED })
      setCompletingOrder(false)
      await loadOrder()
      await loadMyActiveLog()
    } finally {
      setBusy(false)
    }
  }

  // Individual clock in/out isn't logged to OrderTracking - the TimeLog
  // table (see the "Turnos" timeline below) is the authoritative record.
  async function handleStartWorking() {
    if (!order) return
    setBusy(true)
    try {
      if (myActiveLog && myActiveLog.workOrderId !== order.id) {
        const proceed = confirm(
          `Estás trabajando en la orden ${myActiveLog.workOrder.code}. Se cerrará ese turno y ` +
            `empezarás a trabajar en ${order.code}. ¿Continuar?`,
        )
        if (!proceed) return
        await clockOut({
          timeLogId: myActiveLog.id,
          durationMinutes: durationMinutesSince(myActiveLog.clockIn),
        })
      }
      await clockIn({ workOrderId: order.id })
      await loadOrder()
      await loadMyActiveLog()
    } finally {
      setBusy(false)
    }
  }

  async function handleStopWorking() {
    if (!order || !myActiveLog) return
    setBusy(true)
    try {
      await clockOut({
        timeLogId: myActiveLog.id,
        durationMinutes: durationMinutesSince(myActiveLog.clockIn),
      })
      await loadOrder()
      await loadMyActiveLog()
    } finally {
      setBusy(false)
    }
  }

  if (order === undefined) {
    return (
      <div className="flex-1 p-4">
        <BackButton to={backTo} />
        <p className="text-sm text-slate-500">Cargando...</p>
      </div>
    )
  }

  if (order === null) {
    return (
      <div className="flex-1 p-4">
        <BackButton to={backTo} />
        <p className="text-sm text-slate-500">Orden no encontrada.</p>
      </div>
    )
  }

  const myAssignment = order.assignments.find((a) => a.technicianId === profile?.id)
  const canManageOrder = !!myAssignment && (myAssignment.isAllowed || myAssignment.isLead)
  const amWorkingHere = myActiveLog?.workOrderId === order.id
  const workingTechnicianIds = new Set(
    order.timeLogs.filter((log) => !log.clockOut).map((log) => log.technicianId),
  )
  const shiftsByTechnician = new Map<string, { name: string; shifts: typeof order.timeLogs }>()
  for (const log of order.timeLogs) {
    const entry = shiftsByTechnician.get(log.technicianId)
    if (entry) entry.shifts.push(log)
    else shiftsByTechnician.set(log.technicianId, { name: log.technician.displayName, shifts: [log] })
  }
  const visibleTracking = order.tracking.filter(
    (event) =>
      event.eventType !== OrderEventType.WORK_STARTED &&
      event.eventType !== OrderEventType.WORK_STOPPED,
  )

  return (
    <div className="flex-1 p-4">
      <BackButton to={backTo} />
      <div className="flex items-center justify-between">
        <h1 className="font-mono text-lg font-semibold text-eb-blue-dark">{order.code}</h1>
        <span className="rounded-full bg-eb-teal/10 px-2.5 py-1 text-xs text-eb-teal-dark">
          {workOrderStatusLabel[order.status]}
        </span>
      </div>
      <p className="text-sm text-slate-500">
        {orderLocationLabel[order.locationCode]} · {order.assetLocation}
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        {(order.status === WorkOrderStatus.PENDING_QUOTE ||
          order.status === WorkOrderStatus.QUOTE_REJECTED) && (
          <HasPermission permission="quotes:upload">
            <input
              ref={quoteFileInputRef}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={handleQuoteFileSelected}
            />
            <button
              disabled={busy || order.quoteAttempts >= 2}
              onClick={() => quoteFileInputRef.current?.click()}
              className="rounded-lg bg-eb-teal px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              + Añadir presupuesto
            </button>
          </HasPermission>
        )}
        {(order.status === WorkOrderStatus.PENDING_QUOTE ||
          order.status === WorkOrderStatus.QUOTE_REJECTED) && (
          <HasPermission permission="admin:lab">
            <button
              disabled={busy || order.quoteAttempts >= 2}
              onClick={handleAddQuoteLab}
              className="rounded-lg border-2 border-dashed border-eb-teal px-3 py-1.5 text-sm font-semibold text-eb-teal-dark disabled:opacity-50"
            >
              Añadir presupuesto (lab)
            </button>
          </HasPermission>
        )}
        {order.status === WorkOrderStatus.PENDING_QUOTE && (
          <HasPermission permission="quotes:approve">
            <button
              disabled={busy || order.quoteAttempts === 0}
              onClick={handleAcceptQuote}
              className="rounded-lg bg-eb-blue px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              Aceptar presupuesto
            </button>
          </HasPermission>
        )}
        {order.status === WorkOrderStatus.AWAITING_ASSIGNMENT && (
          <button
            onClick={() => setAssigning(true)}
            className="rounded-lg bg-eb-blue-dark px-3 py-1.5 text-sm font-semibold text-white"
          >
            Asignar técnicos
          </button>
        )}
        {order.status === WorkOrderStatus.ASSIGNED && canManageOrder && (
          <button
            disabled={busy}
            onClick={() => setStartingOrder(true)}
            className="rounded-lg bg-eb-teal px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            Empezar orden
          </button>
        )}
        {order.status === WorkOrderStatus.IN_PROGRESS && canManageOrder && (
          <button
            disabled={busy}
            onClick={() => setCompletingOrder(true)}
            className="rounded-lg bg-eb-blue px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            Terminar orden
          </button>
        )}
        {!!myAssignment &&
          (order.status === WorkOrderStatus.ASSIGNED ||
            order.status === WorkOrderStatus.IN_PROGRESS) && (
            <button
              onClick={() => setReportingIncident(true)}
              className="rounded-lg border border-red-300 px-3 py-1.5 text-sm font-semibold text-red-600"
            >
              Añadir incidencia
            </button>
          )}
        {!!myAssignment && order.status === WorkOrderStatus.IN_PROGRESS && (
          <button
            disabled={busy}
            onClick={amWorkingHere ? handleStopWorking : handleStartWorking}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50 ${
              amWorkingHere ? 'bg-slate-500' : 'bg-eb-teal'
            }`}
          >
            {amWorkingHere ? 'Dejar de trabajar' : 'Trabajar en esta orden'}
          </button>
        )}
        <HasPermission permission="chat:write">
          <button
            onClick={() => navigate(`/chat/client/${order.id}`, { state: { from: `/orders/${order.id}` } })}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-600 hover:border-eb-blue hover:text-eb-blue"
          >
            Chat con cliente
          </button>
        </HasPermission>
        <HasPermission permission="chat:write">
          <button
            onClick={() =>
              navigate(`/chat/technicians/${order.id}`, { state: { from: `/orders/${order.id}` } })
            }
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-600 hover:border-eb-blue hover:text-eb-blue"
          >
            Chat con técnicos
          </button>
        </HasPermission>
      </div>

      <section className="mt-4 rounded-xl border border-slate-200 bg-white/90 p-4 backdrop-blur-sm">
        <h2 className="text-sm font-semibold text-eb-teal-dark">Cliente</h2>
        <p className="mt-2 text-sm text-slate-700">{order.customer.name}</p>
        <p className="text-sm text-slate-500">
          {order.customer.contactName} · {order.customer.phone}
        </p>
      </section>

      <section className="mt-4 rounded-xl border border-slate-200 bg-white/90 p-4 backdrop-blur-sm">
        <h2 className="text-sm font-semibold text-eb-teal-dark">Embarcación / máquina</h2>
        <p className="mt-2 text-sm text-slate-700">{order.boat.name}</p>
        {order.boat.registrationNumber && (
          <p className="text-sm text-slate-500">Matrícula: {order.boat.registrationNumber}</p>
        )}
        <ul className="mt-2 space-y-1">
          {order.boat.engines.map((engine, i) => (
            <li key={i} className="rounded-lg bg-slate-50 p-2 text-xs text-slate-600">
              {engine.engineType} · chasis {engine.chassisNumber} · propulsor{' '}
              {engine.propellerSerialNumber}
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-4 rounded-xl border border-slate-200 bg-white/90 p-4 backdrop-blur-sm">
        <h2 className="text-sm font-semibold text-eb-teal-dark">Trabajos a realizar</h2>
        <ul className="mt-2 space-y-1">
          {order.tasks.map((task) => (
            <li key={task.id} className="flex items-center gap-2 text-sm text-slate-700">
              <span
                className={`inline-block h-2 w-2 rounded-full ${
                  task.isCompleted ? 'bg-eb-teal' : 'bg-slate-300'
                }`}
              />
              {task.description}
            </li>
          ))}
        </ul>
      </section>

      {order.description && (
        <section className="mt-4 rounded-xl border border-slate-200 bg-white/90 p-4 backdrop-blur-sm">
          <h2 className="text-sm font-semibold text-eb-teal-dark">Comentarios adicionales</h2>
          <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{order.description}</p>
        </section>
      )}

      {order.quotes.length > 0 && (
        <section className="mt-4 rounded-xl border border-slate-200 bg-white/90 p-4 backdrop-blur-sm">
          <h2 className="text-sm font-semibold text-eb-teal-dark">Presupuestos</h2>
          <ul className="mt-2 space-y-3">
            {order.quotes.map((quote) => (
              <li key={quote.id}>
                <p className="text-sm text-slate-700">
                  Intento {quote.attemptNumber}: {quote.decision}
                  {quote.amount != null ? ` · ${quote.amount} €` : ''}
                </p>
                {canViewQuotes && (
                  <div className="mt-2">
                    <PdfViewer url={quote.fileUrl} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {order.assignments.length > 0 && (
        <section className="mt-4 rounded-xl border border-slate-200 bg-white/90 p-4 backdrop-blur-sm">
          <h2 className="text-sm font-semibold text-eb-teal-dark">Técnicos asignados</h2>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {order.assignments.map((assignment) => (
              <li
                key={assignment.technicianId}
                className="rounded-full bg-eb-teal/10 px-2.5 py-0.5 text-xs text-eb-teal-dark"
              >
                {assignment.technician.displayName}
                {workingTechnicianIds.has(assignment.technicianId) ? ' · trabajando' : ''}
              </li>
            ))}
          </ul>
        </section>
      )}

      {order.incidents.length > 0 && (
        <section className="mt-4 rounded-xl border border-slate-200 bg-white/90 p-4 backdrop-blur-sm">
          <h2 className="text-sm font-semibold text-eb-teal-dark">Incidencias</h2>
          <ul className="mt-2 space-y-2">
            {order.incidents.map((incident) => (
              <li key={incident.id} className="rounded-lg bg-red-50 p-2 text-sm text-slate-700">
                <p>{incident.description}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {new Date(incident.createdAt).toLocaleString('es-ES')} ·{' '}
                  {incident.reportedBy.displayName}
                  {incident.resolvedAt ? ' · Resuelta' : ''}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {shiftsByTechnician.size > 0 && (
        <section className="mt-4 rounded-xl border border-slate-200 bg-white/90 p-4 backdrop-blur-sm">
          <h2 className="text-sm font-semibold text-eb-teal-dark">Turnos</h2>
          <div className="mt-2 space-y-3">
            {[...shiftsByTechnician.values()].map(({ name, shifts }) => (
              <div key={name}>
                <p className="text-xs font-medium text-slate-600">{name}</p>
                <ul className="mt-1 space-y-1 border-l-2 border-eb-teal/30 pl-3">
                  {shifts.map((shift) => (
                    <li key={shift.id} className="text-xs text-slate-500">
                      {new Date(shift.clockIn).toLocaleString('es-ES')}
                      {' → '}
                      {shift.clockOut
                        ? new Date(shift.clockOut).toLocaleString('es-ES')
                        : 'en curso'}
                      {shift.durationMinutes != null ? ` · ${shift.durationMinutes} min` : ''}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}

      {order.photos.length > 0 && (
        <section className="mt-4 rounded-xl border border-slate-200 bg-white/90 p-4 backdrop-blur-sm">
          <h2 className="text-sm font-semibold text-eb-teal-dark">Fotos</h2>
          <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
            {order.photos.map((photo) =>
              photo.mediaType === MediaType.VIDEO ? (
                <video
                  key={photo.id}
                  src={photo.storageUrl}
                  controls
                  title={`${photoStageLabel[photo.stage]} · ${photo.uploadedBy.displayName}`}
                  className="aspect-square w-full rounded-lg object-cover"
                />
              ) : (
                <a key={photo.id} href={photo.storageUrl} target="_blank" rel="noreferrer">
                  <img
                    src={photo.storageUrl}
                    alt={photoStageLabel[photo.stage]}
                    title={`${photoStageLabel[photo.stage]} · ${photo.uploadedBy.displayName}`}
                    className="aspect-square w-full rounded-lg object-cover"
                  />
                </a>
              ),
            )}
          </div>
        </section>
      )}

      <section className="mt-4 rounded-xl border border-slate-200 bg-white/90 p-4 backdrop-blur-sm">
        <h2 className="text-sm font-semibold text-eb-teal-dark">Historial</h2>
        <ul className="mt-2 space-y-1">
          {visibleTracking.map((event, i) => (
            <li key={i} className="text-xs text-slate-500">
              {new Date(event.occurredAt).toLocaleString('es-ES')} · {event.actor.displayName} ·{' '}
              {orderEventTypeLabel[event.eventType]}
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-4 rounded-xl border border-slate-200 bg-white/90 p-4 backdrop-blur-sm">
        <h2 className="text-sm font-semibold text-eb-teal-dark">Informe PDF</h2>
        {order.finalReportUrl ? (
          <div className="mt-2">
            <PdfViewer url={order.finalReportUrl} />
          </div>
        ) : (
          <p className="mt-2 text-sm text-slate-500">Todavía no hay un informe generado.</p>
        )}
      </section>

      {assigning && (
        <TechnicianAssignModal
          order={order}
          onClose={() => setAssigning(false)}
          onSaved={() => {
            setAssigning(false)
            loadOrder()
          }}
        />
      )}

      {reportingIncident && (
        <IncidentModal
          workOrderId={order.id}
          code={order.code}
          onClose={() => setReportingIncident(false)}
          onSaved={() => {
            setReportingIncident(false)
            loadOrder()
          }}
        />
      )}

      {startingOrder && (
        <PhotoUploadModal
          stage={PhotoStage.START}
          onClose={() => setStartingOrder(false)}
          onConfirm={handleStartOrder}
        />
      )}

      {completingOrder && (
        <PhotoUploadModal
          stage={PhotoStage.FINAL}
          onClose={() => setCompletingOrder(false)}
          onConfirm={handleCompleteOrder}
        />
      )}
    </div>
  )
}
