import { useCallback, useEffect, useState } from 'react'
import { MessageCircle, Wrench } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import {
  WorkOrderStatus,
  getMyActiveTimeLog,
  listMyAssignedWorkOrders,
  type ListMyAssignedWorkOrdersData,
} from '@dataconnect/generated'
import { BackButton } from '../components/BackButton'
import { HasPermission } from '../components/HasPermission'
import { useAuth } from '../contexts/AuthContext'
import { usePermission } from '../hooks/usePermission'
import { pickActiveShift } from '../lib/activeShift'
import { subscribeToUnreadOrderIds } from '../lib/chat'
import { FRESH } from '../lib/dataConnectOptions'
import { formatSnapshotTime, readSnapshot, writeSnapshot } from '../lib/offlineStore'
import { orderLocationLabel } from '../lib/orderCode'
import { workOrderStatusColor, workOrderStatusLabel } from '../lib/orderStatus'
import { WORKSHOP_LOCATIONS, formatWorkshopMonth } from '../lib/workshop'

type Assignment = ListMyAssignedWorkOrdersData['technicianAssignments'][number]

export function AssignmentsPage() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const canChat = usePermission('chat:write')
  const [assignments, setAssignments] = useState<Assignment[] | null>(null)
  const [workingOrderId, setWorkingOrderId] = useState<string | null>(null)
  const [unreadOrderIds, setUnreadOrderIds] = useState<Set<string>>(new Set())
  const [loadError, setLoadError] = useState(false)
  // Set when the list on screen is the copy kept in the phone, not a fresh read.
  const [snapshotAt, setSnapshotAt] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoadError(false)
    listMyAssignedWorkOrders(FRESH)
      .then((res) => {
        setAssignments(res.data.technicianAssignments)
        setSnapshotAt(null)
        if (profile) writeSnapshot(profile.id, "assignments", res.data.technicianAssignments)
      })
      .catch(() => {
        // Out of coverage the phone still has the last read: better their
        // orders from this morning than an empty screen at the boat.
        const snapshot = profile ? readSnapshot<Assignment[]>(profile.id, "assignments") : null
        if (snapshot) {
          setAssignments(snapshot.data)
          setSnapshotAt(snapshot.at)
        } else {
          setLoadError(true)
        }
      })
    // Only highlights the order being worked on - if it fails the list is
    // still usable, so it doesn't get its own error.
    getMyActiveTimeLog(FRESH)
      .then((res) => setWorkingOrderId(pickActiveShift(res.data.timeLogs)?.workOrderId ?? null))
      .catch(() => {})
  }, [profile])

  useEffect(load, [load])

  useEffect(() => {
    if (!assignments || !profile || !canChat) return
    return subscribeToUnreadOrderIds(
      'technicians',
      assignments.map((a) => a.workOrder.id),
      profile.id,
      setUnreadOrderIds,
    )
  }, [assignments, profile, canChat])

  const pendingAssignments = assignments?.filter(
    (assignment) => assignment.workOrder.status !== WorkOrderStatus.COMPLETED,
  )
  // The month's workshop orders sit apart, on top: everyone is on them all
  // month, so in the list they'd be three rows every technician scrolls past
  // to reach the orders that are actually theirs.
  const workshopAssignments = pendingAssignments
    ?.filter((assignment) => assignment.workOrder.workshopMonth)
    .sort(
      (a, b) =>
        (b.workOrder.workshopMonth ?? '').localeCompare(a.workOrder.workshopMonth ?? '') ||
        WORKSHOP_LOCATIONS.indexOf(a.workOrder.locationCode) -
          WORKSHOP_LOCATIONS.indexOf(b.workOrder.locationCode),
    )
  const orderAssignments = pendingAssignments?.filter(
    (assignment) => !assignment.workOrder.workshopMonth,
  )

  return (
    <div className="flex-1 p-4">
      <BackButton to="/" />
      <h1 className="text-lg font-semibold text-eb-blue-dark">Asignaciones</h1>
      <p className="text-sm text-slate-500">Órdenes de trabajo en las que estás asignado.</p>

      <div className="mt-4 space-y-2">
        {loadError && (
          <div className="flex items-center justify-between gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
            <span>No se han podido cargar tus asignaciones.</span>
            <button onClick={load} className="shrink-0 font-semibold underline">
              Reintentar
            </button>
          </div>
        )}
        {snapshotAt && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Sin conexión. Datos guardados del {formatSnapshotTime(snapshotAt)}. Puedes fichar y
            marcar trabajos: se enviarán solos al recuperar cobertura.
          </p>
        )}
        {assignments === null && !loadError && <p className="text-sm text-slate-500">Cargando...</p>}
        {workshopAssignments && workshopAssignments.length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            {workshopAssignments.map((assignment) => {
              const isWorkingHere = assignment.workOrder.id === workingOrderId
              return (
                <button
                  key={assignment.workOrder.id}
                  onClick={() =>
                    navigate(`/orders/${assignment.workOrder.id}`, { state: { from: '/assignments' } })
                  }
                  title={isWorkingHere ? 'Trabajando ahora' : undefined}
                  className={`min-w-0 rounded-xl bg-white/90 p-3 text-left ${
                    isWorkingHere ? 'border-2 border-eb-teal' : 'border border-slate-200'
                  }`}
                >
                  <p className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-slate-500">
                    <Wrench className="h-3 w-3 shrink-0" />
                    Taller
                  </p>
                  <p className="truncate text-sm font-semibold text-eb-blue-dark">
                    {orderLocationLabel[assignment.workOrder.locationCode]}
                  </p>
                  <p className="truncate text-xs text-slate-500">
                    {formatWorkshopMonth(assignment.workOrder.workshopMonth ?? '')}
                  </p>
                </button>
              )
            })}
          </div>
        )}
        {orderAssignments?.length === 0 && (
          <p className="text-sm text-slate-500">No tienes órdenes asignadas pendientes.</p>
        )}
        {orderAssignments?.map((assignment) => {
          const isWorkingHere = assignment.workOrder.id === workingOrderId
          return (
            <div
              key={assignment.workOrder.id}
              title={isWorkingHere ? 'Trabajando ahora' : undefined}
              className={`flex items-center gap-2 rounded-xl bg-white/90 p-4 ${
                isWorkingHere ? 'border-2 border-eb-teal' : 'border border-slate-200'
              }`}
            >
              <button
                onClick={() =>
                  navigate(`/orders/${assignment.workOrder.id}`, { state: { from: '/assignments' } })
                }
                className="flex flex-1 items-center justify-between text-left"
              >
                <div>
                  <p className="font-mono text-sm font-semibold text-eb-blue-dark">
                    {assignment.workOrder.code}
                  </p>
                  <p className="text-sm text-slate-500">{assignment.workOrder.boat.name}</p>
                </div>
                <div className="flex items-center gap-2">
                  {(assignment.isAllowed || assignment.isLead) && (
                    <span className="rounded-full bg-eb-blue/10 px-2.5 py-0.5 text-xs text-eb-blue-dark">
                      {assignment.isLead ? 'Jefe de la orden' : 'Autorizado'}
                    </span>
                  )}
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs ${workOrderStatusColor[assignment.workOrder.status]}`}
                  >
                    {workOrderStatusLabel[assignment.workOrder.status]}
                  </span>
                </div>
              </button>
              <HasPermission permission="chat:write">
                <button
                  onClick={() =>
                    navigate(`/chat/technicians/${assignment.workOrder.id}`, {
                      state: { from: '/assignments' },
                    })
                  }
                  className="relative rounded-lg border border-slate-300 p-2 text-slate-500 hover:border-eb-blue hover:text-eb-blue"
                  title="Chat con técnicos"
                >
                  <MessageCircle className="h-4 w-4" />
                  {unreadOrderIds.has(assignment.workOrder.id) && (
                    <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-red-500" />
                  )}
                </button>
              </HasPermission>
            </div>
          )
        })}
      </div>
    </div>
  )
}
