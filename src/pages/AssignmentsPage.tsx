import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  getMyActiveTimeLog,
  listMyAssignedWorkOrders,
  type ListMyAssignedWorkOrdersData,
} from '@dataconnect/generated'
import { BackButton } from '../components/BackButton'
import { FRESH } from '../lib/dataConnectOptions'
import { workOrderStatusLabel } from '../lib/orderStatus'

type Assignment = ListMyAssignedWorkOrdersData['technicianAssignments'][number]

export function AssignmentsPage() {
  const navigate = useNavigate()
  const [assignments, setAssignments] = useState<Assignment[] | null>(null)
  const [workingOrderId, setWorkingOrderId] = useState<string | null>(null)

  useEffect(() => {
    listMyAssignedWorkOrders(FRESH).then((res) => setAssignments(res.data.technicianAssignments))
    getMyActiveTimeLog(FRESH).then((res) => setWorkingOrderId(res.data.timeLogs[0]?.workOrderId ?? null))
  }, [])

  return (
    <div className="flex-1 p-4">
      <BackButton to="/" />
      <h1 className="text-lg font-semibold text-eb-blue-dark">Asignaciones</h1>
      <p className="text-sm text-slate-500">Órdenes de trabajo en las que estás asignado.</p>

      <div className="mt-4 space-y-2">
        {assignments?.length === 0 && (
          <p className="text-sm text-slate-500">No tienes órdenes asignadas.</p>
        )}
        {assignments?.map((assignment) => (
          <button
            key={assignment.workOrder.id}
            onClick={() =>
              navigate(`/orders/${assignment.workOrder.id}`, { state: { from: '/assignments' } })
            }
            className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white/90 p-4 text-left"
          >
            <div className="flex items-center gap-2">
              {assignment.workOrder.id === workingOrderId && (
                <span
                  title="Trabajando ahora"
                  className="h-2.5 w-2.5 shrink-0 rounded-full bg-eb-teal"
                />
              )}
              <div>
                <p className="font-mono text-sm font-semibold text-eb-blue-dark">
                  {assignment.workOrder.code}
                </p>
                <p className="text-sm text-slate-500">{assignment.workOrder.boat.name}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {(assignment.isAllowed || assignment.isLead) && (
                <span className="rounded-full bg-eb-blue/10 px-2.5 py-0.5 text-xs text-eb-blue-dark">
                  {assignment.isLead ? 'Jefe de la orden' : 'Allowed'}
                </span>
              )}
              <span className="rounded-full bg-eb-teal/10 px-2.5 py-0.5 text-xs text-eb-teal-dark">
                {workOrderStatusLabel[assignment.workOrder.status]}
              </span>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
