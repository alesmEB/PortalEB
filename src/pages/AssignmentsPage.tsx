import { useEffect, useState } from 'react'
import { MessageCircle } from 'lucide-react'
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
import { subscribeToUnreadOrderIds } from '../lib/chat'
import { FRESH } from '../lib/dataConnectOptions'
import { workOrderStatusLabel } from '../lib/orderStatus'

type Assignment = ListMyAssignedWorkOrdersData['technicianAssignments'][number]

export function AssignmentsPage() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const canChat = usePermission('chat:write')
  const [assignments, setAssignments] = useState<Assignment[] | null>(null)
  const [workingOrderId, setWorkingOrderId] = useState<string | null>(null)
  const [unreadOrderIds, setUnreadOrderIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    listMyAssignedWorkOrders(FRESH).then((res) => setAssignments(res.data.technicianAssignments))
    getMyActiveTimeLog(FRESH).then((res) => setWorkingOrderId(res.data.timeLogs[0]?.workOrderId ?? null))
  }, [])

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

  return (
    <div className="flex-1 p-4">
      <BackButton to="/" />
      <h1 className="text-lg font-semibold text-eb-blue-dark">Asignaciones</h1>
      <p className="text-sm text-slate-500">Órdenes de trabajo en las que estás asignado.</p>

      <div className="mt-4 space-y-2">
        {pendingAssignments?.length === 0 && (
          <p className="text-sm text-slate-500">No tienes órdenes asignadas pendientes.</p>
        )}
        {pendingAssignments?.map((assignment) => {
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
                  <span className="rounded-full bg-eb-teal/10 px-2.5 py-0.5 text-xs text-eb-teal-dark">
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
