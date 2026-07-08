import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { listWorkOrders, type ListWorkOrdersData } from '@dataconnect/generated'
import { orderLocationLabel } from '../lib/orderCode'
import { workOrderStatusLabel } from '../lib/orderStatus'

export function OrdersListPage() {
  const navigate = useNavigate()
  const [orders, setOrders] = useState<ListWorkOrdersData['workOrders'] | null>(null)

  useEffect(() => {
    listWorkOrders().then((res) => setOrders(res.data.workOrders))
  }, [])

  return (
    <div className="flex-1 p-4">
      <h1 className="text-lg font-semibold text-eb-blue-dark">Órdenes de trabajo</h1>

      {orders === null && <p className="mt-4 text-sm text-slate-500">Cargando...</p>}

      {orders !== null && orders.length === 0 && (
        <p className="mt-4 text-sm text-slate-500">Todavía no hay órdenes creadas.</p>
      )}

      <div className="mt-4 space-y-2">
        {orders?.map((order) => (
          <button
            key={order.id}
            onClick={() => navigate(`/orders/${order.id}`)}
            className="block w-full rounded-xl border border-slate-200 bg-white/90 p-4 text-left backdrop-blur-sm transition-colors hover:border-eb-blue"
          >
            <div className="flex items-center justify-between">
              <p className="font-mono text-sm font-semibold text-eb-blue-dark">{order.code}</p>
              <span className="rounded-full bg-eb-teal/10 px-2.5 py-1 text-xs text-eb-teal-dark">
                {workOrderStatusLabel[order.status]}
              </span>
            </div>
            <p className="mt-1 text-sm text-slate-700">
              {order.customer.name} · {order.boat.name}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {orderLocationLabel[order.locationCode]} · {order.assetLocation}
            </p>
          </button>
        ))}
      </div>
    </div>
  )
}
