import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { Camera, ChevronDown, FileText, Images, Paperclip, Video } from 'lucide-react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import {
  MediaType,
  OrderEventType,
  PhotoStage,
  UserRole,
  WorkOrderStatus,
  getMyActiveTimeLog,
  getWorkOrderDetail,
  listAssignableUsers,
  type GetMyActiveTimeLogData,
  type GetWorkOrderDetailData,
  type ListAssignableUsersData,
} from '@dataconnect/generated'
import { BackButton } from '../components/BackButton'
import { HasPermission } from '../components/HasPermission'
import { PdfViewer } from '../components/PdfViewer'
import { useAuth } from '../contexts/AuthContext'
import { usePermission } from '../hooks/usePermission'
import { subscribeToMessages, type ChatKind, type ChatMessage } from '../lib/chat'
import { FRESH } from '../lib/dataConnectOptions'
import { mediaTypeOf, validateMediaFile } from '../lib/media'
import { orderLocationLabel } from '../lib/orderCode'
import { orderEventTypeLabel } from '../lib/orderEvent'
import {
  acceptQuote,
  addQuote,
  adminDeleteTimeLog,
  adminUpdateTimeLog,
  assignTechnicians,
  completeOrder,
  reportIncident,
  startOrder,
  startWorking,
  stopWorking,
  toggleWorkOrderTask,
} from '../lib/orderWorkflow'
import { workOrderStatusLabel } from '../lib/orderStatus'
import { uploadWorkOrderPhoto } from '../lib/photoStorage'
import { uploadQuotePdf } from '../lib/quoteStorage'

type WorkOrder = NonNullable<GetWorkOrderDetailData['workOrder']>
type AssignableUser = ListAssignableUsersData['users'][number]
type ActiveTimeLog = GetMyActiveTimeLogData['timeLogs'][number]
type TimeLogRow = WorkOrder['timeLogs'][number]

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
  const [error, setError] = useState<string | null>(null)

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
    setError(null)
    try {
      const assignments = [...selected].map(([technicianId, flags]) => ({ technicianId, ...flags }))
      const result = await assignTechnicians({
        workOrderId: order.id,
        code: order.code,
        assignments,
        expectedTechnicianIds: [...initialSelection.keys()],
      })
      setSubmitted(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar.')
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

        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
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
      {/* Separate single-mimetype inputs for photo vs video capture -
          `capture` only reliably jumps straight to the camera/camcorder app
          when `accept` is unambiguous; combining "image/*,video/*" on one
          input leaves Android unsure which capture mode to launch, so it
          falls back to the gallery picker instead. */}
      <div className="mt-3 grid grid-cols-3 gap-2">
        <label className="flex cursor-pointer flex-col items-center gap-1 rounded-lg border-2 border-dashed border-slate-300 p-3 text-center text-xs text-eb-blue">
          <Camera className="h-5 w-5" />
          {validating ? '...' : 'Foto'}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            disabled={validating}
            className="hidden"
            onChange={handleFilesSelected}
          />
        </label>
        <label className="flex cursor-pointer flex-col items-center gap-1 rounded-lg border-2 border-dashed border-slate-300 p-3 text-center text-xs text-eb-blue">
          <Video className="h-5 w-5" />
          {validating ? '...' : 'Vídeo'}
          <input
            type="file"
            accept="video/*"
            capture="environment"
            disabled={validating}
            className="hidden"
            onChange={handleFilesSelected}
          />
        </label>
        <label className="flex cursor-pointer flex-col items-center gap-1 rounded-lg border-2 border-dashed border-slate-300 p-3 text-center text-xs text-eb-blue">
          <Images className="h-5 w-5" />
          {validating ? '...' : 'Galería'}
          <input
            type="file"
            accept="image/*,video/*"
            multiple
            disabled={validating}
            className="hidden"
            onChange={handleFilesSelected}
          />
        </label>
      </div>
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
      const photos = []
      for (const file of files) {
        const url = await uploadWorkOrderPhoto(code, 'incident', file)
        photos.push({ url, mediaType: mediaTypeOf(file) })
      }
      await reportIncident({ workOrderId, description: description.trim(), photos })
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

function toDatetimeLocalValue(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function EditTimeLogModal({
  timeLog,
  onClose,
  onSaved,
}: {
  // clockOut is only ever passed in for already-finished shifts (see the
  // guard around the "Editar" button below), but the field itself is
  // nullable on the type (active shifts have none) - fall back to clockIn
  // just to keep this a valid datetime-local value; never actually hit.
  timeLog: { id: string; clockIn: string; clockOut?: string | null; technician: { displayName: string } }
  onClose: () => void
  onSaved: () => void
}) {
  const [clockIn, setClockIn] = useState(toDatetimeLocalValue(timeLog.clockIn))
  const [clockOut, setClockOut] = useState(toDatetimeLocalValue(timeLog.clockOut ?? timeLog.clockIn))
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const canSubmit = !!clockIn && !!clockOut && new Date(clockOut) > new Date(clockIn)

  async function handleSubmit() {
    setSubmitting(true)
    setError(null)
    try {
      await adminUpdateTimeLog({
        timeLogId: timeLog.id,
        clockIn: new Date(clockIn).toISOString(),
        clockOut: new Date(clockOut).toISOString(),
      })
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete() {
    setDeleting(true)
    setError(null)
    try {
      await adminDeleteTimeLog(timeLog.id)
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo eliminar.')
      setDeleting(false)
      setConfirmingDelete(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-4 sm:items-center">
      <div className="w-full max-w-sm rounded-xl bg-white p-4 shadow-xl">
        <h2 className="text-sm font-semibold text-eb-blue-dark">Corregir turno</h2>
        <p className="mt-1 text-xs text-slate-500">{timeLog.technician.displayName}</p>
        <label className="mt-3 block text-xs font-medium text-slate-500">
          Entrada
          <input
            type="datetime-local"
            value={clockIn}
            onChange={(e) => setClockIn(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 outline-none focus:border-eb-blue"
          />
        </label>
        <label className="mt-3 block text-xs font-medium text-slate-500">
          Salida
          <input
            type="datetime-local"
            value={clockOut}
            onChange={(e) => setClockOut(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 outline-none focus:border-eb-blue"
          />
        </label>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

        {confirmingDelete ? (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3">
            <p className="text-xs text-red-700">
              ¿Eliminar este turno? Esta acción no se puede deshacer.
            </p>
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => setConfirmingDelete(false)}
                disabled={deleting}
                className="flex-1 rounded-lg border border-slate-300 py-2 text-sm text-slate-600 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 rounded-lg bg-red-600 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {deleting ? 'Eliminando...' : 'Eliminar'}
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-4 flex gap-2">
            <button
              onClick={onClose}
              className="flex-1 rounded-lg border border-slate-300 py-2 text-sm text-slate-600"
            >
              Cancelar
            </button>
            <button
              disabled={!canSubmit || submitting}
              onClick={handleSubmit}
              className="flex-1 rounded-lg bg-eb-blue py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {submitting ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        )}
        {!confirmingDelete && (
          <button
            onClick={() => setConfirmingDelete(true)}
            className="mt-2 w-full text-center text-xs text-red-600 hover:underline"
          >
            Eliminar turno
          </button>
        )}
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

const chatLabelByKind: Record<ChatKind, string> = {
  client: 'Chat cliente',
  technicians: 'Chat técnicos',
}

/** Every photo/video/document ever attached in either chat for this order,
 * collapsed by default - each viewer only ever sees the chat(s) they can
 * actually access (subscribeToMessages degrades a chat they're not part of
 * to an empty list rather than erroring). */
function ChatFilesSection({ orderId }: { orderId: string }) {
  const [open, setOpen] = useState(false)
  const [clientMessages, setClientMessages] = useState<ChatMessage[] | null>(null)
  const [technicianMessages, setTechnicianMessages] = useState<ChatMessage[] | null>(null)

  useEffect(() => {
    const unsubClient = subscribeToMessages('client', orderId, setClientMessages)
    const unsubTechnicians = subscribeToMessages('technicians', orderId, setTechnicianMessages)
    return () => {
      unsubClient()
      unsubTechnicians()
    }
  }, [orderId])

  const files = useMemo(() => {
    const tagged = [
      ...(clientMessages ?? []).map((m) => ({ message: m, kind: 'client' as const })),
      ...(technicianMessages ?? []).map((m) => ({ message: m, kind: 'technicians' as const })),
    ]
    return tagged
      .filter((t) => t.message.attachmentUrl)
      .sort((a, b) => (b.message.createdAt?.toMillis() ?? 0) - (a.message.createdAt?.toMillis() ?? 0))
  }, [clientMessages, technicianMessages])

  const loaded = clientMessages !== null && technicianMessages !== null

  return (
    <div className="mt-4 rounded-xl border border-slate-200 bg-white/90 backdrop-blur-sm">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between p-4"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-eb-blue-dark">
          <Paperclip className="h-4 w-4" />
          Archivos del chat
          {loaded && files.length > 0 && (
            <span className="rounded-full bg-eb-blue px-2 py-0.5 text-xs text-white">
              {files.length}
            </span>
          )}
        </span>
        <ChevronDown
          className={`h-4 w-4 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="space-y-2 border-t border-slate-200 p-4">
          {!loaded && <p className="text-xs text-slate-400">Cargando...</p>}
          {loaded && files.length === 0 && (
            <p className="text-xs text-slate-400">Todavía no se han compartido archivos.</p>
          )}
          {files.map(({ message, kind }) => (
            <a
              key={message.id}
              href={message.attachmentUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-lg border border-slate-200 p-2 hover:border-eb-blue"
            >
              {message.attachmentType === 'PHOTO' && (
                <img src={message.attachmentUrl} alt="" className="h-10 w-10 shrink-0 rounded object-cover" />
              )}
              {message.attachmentType === 'VIDEO' && (
                <Video className="h-6 w-6 shrink-0 text-slate-400" />
              )}
              {message.attachmentType === 'FILE' && (
                <FileText className="h-6 w-6 shrink-0 text-slate-400" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-slate-700">
                  {message.attachmentName ?? (message.attachmentType === 'VIDEO' ? 'Vídeo' : 'Foto')}
                </p>
                <p className="truncate text-[11px] text-slate-400">
                  {chatLabelByKind[kind]} · {message.senderName}
                  {message.createdAt ? ` · ${message.createdAt.toDate().toLocaleDateString('es-ES')}` : ''}
                </p>
              </div>
            </a>
          ))}
        </div>
      )}
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
  const [editingTimeLog, setEditingTimeLog] = useState<TimeLogRow | null>(null)
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
      const fileUrl = await uploadQuotePdf(order.code, order.quoteAttempts + 1, file)
      await addQuote(order.id, fileUrl)
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
      await acceptQuote(order.id)
      await loadOrder()
    } finally {
      setBusy(false)
    }
  }

  async function uploadOrderPhotos(order: WorkOrder, storageStage: 'start' | 'final', files: File[]) {
    const photos = []
    for (const file of files) {
      const url = await uploadWorkOrderPhoto(order.code, storageStage, file)
      photos.push({ url, mediaType: mediaTypeOf(file) })
    }
    return photos
  }

  async function handleStartOrder(files: File[]) {
    if (!order) return
    setBusy(true)
    try {
      const photos = await uploadOrderPhotos(order, 'start', files)
      await startOrder(order.id, photos)
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
      const photos = await uploadOrderPhotos(order, 'final', files)
      await completeOrder(order.id, photos)
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
      }
      await startWorking(order.id)
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
      await stopWorking()
      await loadOrder()
      await loadMyActiveLog()
    } finally {
      setBusy(false)
    }
  }

  async function handleToggleTask(taskId: string, isCompleted: boolean) {
    setBusy(true)
    try {
      await toggleWorkOrderTask(taskId, isCompleted)
      await loadOrder()
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
  const canToggleTasks = !!myAssignment && order.status === WorkOrderStatus.IN_PROGRESS
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
        {(order.status === WorkOrderStatus.ASSIGNED ||
          order.status === WorkOrderStatus.IN_PROGRESS) && (
          <button
            onClick={() => setAssigning(true)}
            className="rounded-lg bg-eb-blue-dark px-3 py-1.5 text-sm font-semibold text-white"
          >
            Añadir técnicos
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

      <ChatFilesSection orderId={order.id} />

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
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-eb-teal-dark">Trabajos a realizar</h2>
          {order.tasks.length > 0 && (
            <span className="text-xs text-slate-500">
              {order.tasks.filter((t) => t.isCompleted).length}/{order.tasks.length}
            </span>
          )}
        </div>
        <ul className="mt-2 space-y-1">
          {order.tasks.map((task) =>
            canToggleTasks ? (
              <li key={task.id}>
                <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={task.isCompleted}
                    disabled={busy}
                    onChange={(e) => handleToggleTask(task.id, e.target.checked)}
                  />
                  <span className={task.isCompleted ? 'text-slate-400 line-through' : ''}>
                    {task.description}
                  </span>
                </label>
              </li>
            ) : (
              <li key={task.id} className="flex items-center gap-2 text-sm text-slate-700">
                <span
                  className={`inline-block h-2 w-2 rounded-full ${
                    task.isCompleted ? 'bg-eb-teal' : 'bg-slate-300'
                  }`}
                />
                <span className={task.isCompleted ? 'text-slate-400 line-through' : ''}>
                  {task.description}
                </span>
              </li>
            ),
          )}
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
            {[...shiftsByTechnician.values()].map(({ name, shifts }) => {
              const totalMinutes = shifts.reduce((sum, shift) => sum + (shift.durationMinutes ?? 0), 0)
              return (
                <div key={name}>
                  <p className="flex items-center justify-between text-xs font-medium text-slate-600">
                    <span>{name}</span>
                    <span className="text-slate-500">{totalMinutes} min</span>
                  </p>
                  <ul className="mt-1 space-y-1 border-l-2 border-eb-teal/30 pl-3">
                    {shifts.map((shift) => (
                      <li
                        key={shift.id}
                        className="flex items-center justify-between gap-2 text-xs text-slate-500"
                      >
                        <span>
                          {new Date(shift.clockIn).toLocaleString('es-ES')}
                          {' → '}
                          {shift.clockOut
                            ? new Date(shift.clockOut).toLocaleString('es-ES')
                            : 'en curso'}
                          {shift.durationMinutes != null ? ` · ${shift.durationMinutes} min` : ''}
                        </span>
                        {shift.clockOut && (
                          <HasPermission permission="admin:manage">
                            <button
                              onClick={() => setEditingTimeLog(shift)}
                              className="text-slate-400 hover:text-eb-blue"
                              title="Corregir turno"
                            >
                              Editar
                            </button>
                          </HasPermission>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )
            })}
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

      {editingTimeLog && (
        <EditTimeLogModal
          timeLog={editingTimeLog}
          onClose={() => setEditingTimeLog(null)}
          onSaved={() => {
            setEditingTimeLog(null)
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
