import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  OrderLocation,
  WorkOrderStatus,
  listWorkOrders,
  type ListWorkOrdersData,
} from '@dataconnect/generated'
import { BackButton } from '../components/BackButton'
import { orderLocationLabel } from '../lib/orderCode'
import { workOrderStatusLabel } from '../lib/orderStatus'

type LocationFilter = OrderLocation | 'ALL'
type StatusFilter = WorkOrderStatus | 'ALL'

export function OrdersListPage() {
  const navigate = useNavigate()
  const [orders, setOrders] = useState<ListWorkOrdersData['workOrders'] | null>(null)

  const [locationFilter, setLocationFilter] = useState<LocationFilter>('ALL')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL')
  const [boatFilter, setBoatFilter] = useState('')
  const [searchText, setSearchText] = useState('')

  useEffect(() => {
    listWorkOrders().then((res) => setOrders(res.data.workOrders))
  }, [])

  const filteredOrders = useMemo(() => {
    if (!orders) return null
    const boatQuery = boatFilter.trim().toLowerCase()
    const searchQuery = searchText.trim().toLowerCase()

    return orders.filter((order) => {
      if (locationFilter !== 'ALL' && order.locationCode !== locationFilter) return false
      if (statusFilter !== 'ALL' && order.status !== statusFilter) return false
      if (boatQuery && !order.boat.name.toLowerCase().includes(boatQuery)) return false
      if (searchQuery) {
        const haystack =
          `${order.code} ${order.customer.name} ${order.boat.name} ${order.assetLocation}`.toLowerCase()
        if (!haystack.includes(searchQuery)) return false
      }
      return true
    })
  }, [orders, locationFilter, statusFilter, boatFilter, searchText])

  return (
    <div className="flex-1 p-4">
      <BackButton to="/" />
      <h1 className="text-lg font-semibold text-eb-blue-dark">Órdenes de trabajo</h1>

      <div className="mt-4 space-y-3 rounded-xl border border-slate-200 bg-white/90 p-4 backdrop-blur-sm">
        <div>
          <p className="text-xs font-medium text-slate-500">Localización</p>
          <div className="mt-1 flex flex-wrap gap-2">
            <button
              onClick={() => setLocationFilter('ALL')}
              className={`rounded-lg border px-3 py-1.5 text-sm ${
                locationFilter === 'ALL'
                  ? 'border-eb-blue bg-eb-blue text-white'
                  : 'border-slate-300 text-slate-600'
              }`}
            >
              Todas
            </button>
            {Object.values(OrderLocation).map((loc) => (
              <button
                key={loc}
                onClick={() => setLocationFilter(loc)}
                className={`rounded-lg border px-3 py-1.5 text-sm ${
                  locationFilter === loc
                    ? 'border-eb-blue bg-eb-blue text-white'
                    : 'border-slate-300 text-slate-600'
                }`}
              >
                {orderLocationLabel[loc]}
              </button>
            ))}
          </div>
        </div>

        <label className="block text-xs font-medium text-slate-500">
          Estado
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 outline-none focus:border-eb-blue"
          >
            <option value="ALL">Todos</option>
            {Object.values(WorkOrderStatus).map((status) => (
              <option key={status} value={status}>
                {workOrderStatusLabel[status]}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-xs font-medium text-slate-500">
          Embarcación / máquina
          <input
            value={boatFilter}
            onChange={(e) => setBoatFilter(e.target.value)}
            placeholder="Nombre de la embarcación o máquina"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 outline-none focus:border-eb-blue"
          />
        </label>

        <label className="block text-xs font-medium text-slate-500">
          Búsqueda libre
          <input
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Código, cliente, embarcación, ubicación..."
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 outline-none focus:border-eb-blue"
          />
        </label>
      </div>

      {orders === null && <p className="mt-4 text-sm text-slate-500">Cargando...</p>}

      {orders !== null && orders.length === 0 && (
        <p className="mt-4 text-sm text-slate-500">Todavía no hay órdenes creadas.</p>
      )}

      {filteredOrders !== null && orders !== null && orders.length > 0 && filteredOrders.length === 0 && (
        <p className="mt-4 text-sm text-slate-500">Ninguna orden coincide con los filtros.</p>
      )}

      <div className="mt-4 space-y-2">
        {filteredOrders?.map((order) => (
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
