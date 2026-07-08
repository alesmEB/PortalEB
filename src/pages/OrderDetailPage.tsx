import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { getWorkOrderDetail, type GetWorkOrderDetailData } from '@dataconnect/generated'
import { PdfViewer } from '../components/PdfViewer'
import { orderLocationLabel } from '../lib/orderCode'
import { workOrderStatusLabel } from '../lib/orderStatus'

type WorkOrder = NonNullable<GetWorkOrderDetailData['workOrder']>

export function OrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [order, setOrder] = useState<WorkOrder | null | undefined>(undefined)

  useEffect(() => {
    if (!id) return
    getWorkOrderDetail({ id }).then((res) => setOrder(res.data.workOrder))
  }, [id])

  if (order === undefined) {
    return <p className="flex-1 p-4 text-sm text-slate-500">Cargando...</p>
  }

  if (order === null) {
    return <p className="flex-1 p-4 text-sm text-slate-500">Orden no encontrada.</p>
  }

  return (
    <div className="flex-1 p-4">
      <div className="flex items-center justify-between">
        <h1 className="font-mono text-lg font-semibold text-eb-blue-dark">{order.code}</h1>
        <span className="rounded-full bg-eb-teal/10 px-2.5 py-1 text-xs text-eb-teal-dark">
          {workOrderStatusLabel[order.status]}
        </span>
      </div>
      <p className="text-sm text-slate-500">
        {orderLocationLabel[order.locationCode]} · {order.assetLocation}
      </p>

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
          <ul className="mt-2 space-y-1">
            {order.quotes.map((quote, i) => (
              <li key={i} className="text-sm text-slate-700">
                Intento {quote.attemptNumber}: {quote.decision}
                {quote.amount != null ? ` · ${quote.amount} €` : ''}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-4 rounded-xl border border-slate-200 bg-white/90 p-4 backdrop-blur-sm">
        <h2 className="text-sm font-semibold text-eb-teal-dark">Historial</h2>
        <ul className="mt-2 space-y-1">
          {order.tracking.map((event, i) => (
            <li key={i} className="text-xs text-slate-500">
              {new Date(event.occurredAt).toLocaleString('es-ES')} · {event.actor.displayName} ·{' '}
              {event.eventType}
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
    </div>
  )
}
