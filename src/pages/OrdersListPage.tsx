import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, MessageCircle, SlidersHorizontal } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import {
  OrderLocation,
  UserRole,
  WorkOrderStatus,
  getMyLinkedCustomer,
  listWorkOrders,
  listWorkOrdersForCustomer,
  type ListWorkOrdersData,
} from '@dataconnect/generated'
import { BackButton } from '../components/BackButton'
import { HasPermission } from '../components/HasPermission'
import { useAuth } from '../contexts/AuthContext'
import { usePermission } from '../hooks/usePermission'
import { subscribeToUnreadOrderIds } from '../lib/chat'
import { FRESH } from '../lib/dataConnectOptions'
import { orderLocationLabel } from '../lib/orderCode'
import { workOrderStatusColor, workOrderStatusLabel } from '../lib/orderStatus'

type LocationFilter = OrderLocation | 'ALL'
type StatusFilter = WorkOrderStatus | 'ALL'

export function OrdersListPage() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const canChat = usePermission('chat:write')
  const [orders, setOrders] = useState<ListWorkOrdersData['workOrders'] | null>(null)
  const [unreadOrderIds, setUnreadOrderIds] = useState<Set<string>>(new Set())

  const [locationFilter, setLocationFilter] = useState<LocationFilter>('ALL')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL')
  const [boatFilter, setBoatFilter] = useState('')
  const [searchText, setSearchText] = useState('')
  const [hideCompleted, setHideCompleted] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)

  const activeFilterCount =
    (locationFilter !== 'ALL' ? 1 : 0) +
    (statusFilter !== 'ALL' ? 1 : 0) +
    (boatFilter.trim() ? 1 : 0) +
    (searchText.trim() ? 1 : 0) +
    (hideCompleted ? 1 : 0)

  useEffect(() => {
    if (!profile) return
    if (profile.role !== UserRole.CLIENT) {
      listWorkOrders(FRESH).then((res) => setOrders(res.data.workOrders))
      return
    }
    getMyLinkedCustomer(FRESH).then((res) => {
      const customerId = res.data.customers[0]?.id
      if (!customerId) {
        setOrders([])
        return
      }
      listWorkOrdersForCustomer({ customerId }, FRESH).then((res2) =>
        setOrders(res2.data.workOrders),
      )
    })
  }, [profile])

  useEffect(() => {
    if (!orders || !profile || !canChat) return
    return subscribeToUnreadOrderIds(
      'client',
      orders.map((o) => o.id),
      profile.id,
      setUnreadOrderIds,
    )
  }, [orders, profile, canChat])

  const filteredOrders = useMemo(() => {
    if (!orders) return null
    const boatQuery = boatFilter.trim().toLowerCase()
    const searchQuery = searchText.trim().toLowerCase()

    return orders.filter((order) => {
      if (hideCompleted && order.status === WorkOrderStatus.COMPLETED) return false
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
  }, [orders, hideCompleted, locationFilter, statusFilter, boatFilter, searchText])

  return (
    <div className="flex-1 p-4">
      <BackButton to="/" />
      <h1 className="text-lg font-semibold text-eb-blue-dark">Órdenes de trabajo</h1>

      <div className="mt-4 rounded-xl border border-slate-200 bg-white/90 backdrop-blur-sm">
        <button
          onClick={() => setFiltersOpen((open) => !open)}
          className="flex w-full items-center justify-between p-4"
        >
          <span className="flex items-center gap-2 text-sm font-semibold text-eb-blue-dark">
            <SlidersHorizontal className="h-4 w-4" />
            Filtros
            {activeFilterCount > 0 && (
              <span className="rounded-full bg-eb-blue px-2 py-0.5 text-xs text-white">
                {activeFilterCount}
              </span>
            )}
          </span>
          <ChevronDown
            className={`h-4 w-4 text-slate-500 transition-transform ${filtersOpen ? 'rotate-180' : ''}`}
          />
        </button>

        {filtersOpen && (
          <div className="space-y-3 border-t border-slate-200 p-4">
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={hideCompleted}
                onChange={(e) => setHideCompleted(e.target.checked)}
              />
              Ocultar completadas
            </label>

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
        )}
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
          <div
            key={order.id}
            className="rounded-xl border border-slate-200 bg-white/90 p-4 backdrop-blur-sm transition-colors hover:border-eb-blue"
          >
            <div className="flex items-start justify-between gap-2">
              <button
                onClick={() => navigate(`/orders/${order.id}`)}
                className="flex-1 text-left"
              >
                <div className="flex items-center justify-between">
                  <p className="font-mono text-sm font-semibold text-eb-blue-dark">{order.code}</p>
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs ${workOrderStatusColor[order.status]}`}
                  >
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
              <HasPermission permission="chat:write">
                <button
                  onClick={() =>
                    navigate(`/chat/client/${order.id}`, { state: { from: '/orders' } })
                  }
                  className="relative rounded-lg border border-slate-300 p-2 text-slate-500 hover:border-eb-blue hover:text-eb-blue"
                  title="Chat con el cliente"
                >
                  <MessageCircle className="h-4 w-4" />
                  {unreadOrderIds.has(order.id) && (
                    <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-red-500" />
                  )}
                </button>
              </HasPermission>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
