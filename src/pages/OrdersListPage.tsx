import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  ChevronDown,
  ClipboardCheck,
  FileCheck2,
  FileX2,
  MessageCircle,
  Receipt,
  SlidersHorizontal,
  Trash2,
  Wrench,
} from 'lucide-react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
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
import { deleteWorkOrder } from '../lib/orderWorkflow'
import { workOrderStatusColor, workOrderStatusLabel } from '../lib/orderStatus'

type LocationFilter = OrderLocation | 'ALL'
type StatusFilter = WorkOrderStatus | 'ALL'

type OrderRow = ListWorkOrdersData['workOrders'][number]

/** The post-completion admin process (see "Gestión administrativa" in
 * OrderDetailPage). Both sides of each step are offered: administración works
 * off what's still pending, but also needs to pull up what's already done -
 * and the protocol's two outcomes are separate, since "no procedía" is a
 * decision, not a pending step. Only visible with "orders:closing". */
const ADMIN_PROCESS_FILTERS: { value: string; label: string; matches: (order: OrderRow) => boolean }[] =
  [
    {
      value: 'PENDING_ADJUST',
      label: 'Pendientes de ajustar',
      matches: (o) => o.status === WorkOrderStatus.COMPLETED && !o.adjustedAt,
    },
    { value: 'ADJUSTED', label: 'Ajustadas', matches: (o) => !!o.adjustedAt },
    {
      value: 'PENDING_PROTOCOL',
      label: 'Pendientes de protocolo',
      matches: (o) => !!o.adjustedAt && !o.serviceProtocolAt,
    },
    {
      value: 'PROTOCOL_DONE',
      label: 'Protocolo realizado',
      matches: (o) => !!o.serviceProtocolAt && o.serviceProtocolDone === true,
    },
    {
      value: 'PROTOCOL_NOT_APPLICABLE',
      label: 'Protocolo no procedía',
      matches: (o) => !!o.serviceProtocolAt && o.serviceProtocolDone === false,
    },
    {
      value: 'PENDING_INVOICE',
      label: 'Pendientes de facturar',
      matches: (o) => !!o.serviceProtocolAt && !o.invoicedAt,
    },
    { value: 'INVOICED', label: 'Facturadas', matches: (o) => !!o.invoicedAt },
  ]

/** The three post-completion steps as a column under the status, all three
 * always listed so what's still missing shows as plainly as what's done: grey
 * while pending, in colour once passed. A protocol that "no procedía" is a
 * passed step too, told apart by its icon and tooltip. */
function AdminProcessSteps({ order }: { order: OrderRow }) {
  const protocolSkipped = !!order.serviceProtocolAt && order.serviceProtocolDone === false
  const steps = [
    {
      label: 'Ajustada',
      Icon: ClipboardCheck,
      done: !!order.adjustedAt,
      title: order.adjustedAt ? 'Ajustada' : 'Ajuste: pendiente',
    },
    {
      label: 'Protocolo',
      Icon: protocolSkipped ? FileX2 : FileCheck2,
      done: !!order.serviceProtocolAt,
      title: !order.serviceProtocolAt
        ? 'Protocolo de servicio: pendiente'
        : protocolSkipped
          ? 'Protocolo de servicio: no procedía'
          : 'Protocolo de servicio: realizado',
    },
    {
      label: 'Facturada',
      Icon: Receipt,
      done: !!order.invoicedAt,
      title: order.invoicedAt ? 'Facturada' : 'Facturación: pendiente',
    },
  ]
  return (
    <ul className="flex flex-col items-end gap-0.5">
      {steps.map(({ label, Icon, done, title }) => (
        <li
          key={label}
          title={title}
          className={`flex items-center gap-1 text-xs ${done ? 'font-medium text-eb-teal-dark' : 'text-slate-400 opacity-50'}`}
        >
          <Icon className="h-3.5 w-3.5" />
          {label}
        </li>
      ))}
    </ul>
  )
}

export function OrdersListPage() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const canChat = usePermission('chat:write')
  const canViewAdminProcess = usePermission('orders:closing')
  const [orders, setOrders] = useState<ListWorkOrdersData['workOrders'] | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [unreadClientChatIds, setUnreadClientChatIds] = useState<Set<string>>(new Set())
  const [unreadTechnicianChatIds, setUnreadTechnicianChatIds] = useState<Set<string>>(new Set())

  // Filters live in the URL: opening an order and coming back (its "Volver"
  // or the browser's) used to land on the unfiltered list, and whoever was
  // working through "pendientes de facturar" had to set it up again every
  // time. Entering from the dashboard still starts clean.
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const locationFilter = (searchParams.get('loc') ?? 'ALL') as LocationFilter
  const statusFilter = (searchParams.get('status') ?? 'ALL') as StatusFilter
  const boatFilter = searchParams.get('boat') ?? ''
  const searchText = searchParams.get('q') ?? ''
  const hideCompleted = searchParams.get('hideDone') === '1'
  const showDeleted = searchParams.get('deleted') === '1'
  const adminProcessFilter = searchParams.get('admin') ?? 'ALL'
  // Back from an order with filters on, the panel opens as it was left.
  const [filtersOpen, setFiltersOpen] = useState(() => searchParams.size > 0)
  // Where an order or chat opened from here should send "Volver".
  const listPath = `${location.pathname}${location.search}`

  function setFilter(key: string, value: string | null) {
    // From the address bar, not the router's `prev`: that one is the render's
    // copy, and two changes before the next render (the location, then the
    // status right after) had the second wipe out the first.
    const next = new URLSearchParams(window.location.search)
    if (value) next.set(key, value)
    else next.delete(key)
    setSearchParams(next, { replace: true })
  }
  const setLocationFilter = (value: LocationFilter) => setFilter('loc', value === 'ALL' ? null : value)
  const setStatusFilter = (value: StatusFilter) => setFilter('status', value === 'ALL' ? null : value)
  const setBoatFilter = (value: string) => setFilter('boat', value || null)
  const setSearchText = (value: string) => setFilter('q', value || null)
  const setHideCompleted = (value: boolean) => setFilter('hideDone', value ? '1' : null)
  const setShowDeleted = (value: boolean) => setFilter('deleted', value ? '1' : null)
  const setAdminProcessFilter = (value: string) => setFilter('admin', value === 'ALL' ? null : value)
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null)
  const canDelete = usePermission('orders:delete')

  const activeFilterCount =
    (locationFilter !== 'ALL' ? 1 : 0) +
    (statusFilter !== 'ALL' ? 1 : 0) +
    (boatFilter.trim() ? 1 : 0) +
    (searchText.trim() ? 1 : 0) +
    (hideCompleted ? 1 : 0) +
    (showDeleted ? 1 : 0) +
    (adminProcessFilter !== 'ALL' ? 1 : 0)

  const load = useCallback(async () => {
    if (!profile) return
    if (profile.role !== UserRole.CLIENT) {
      const res = await listWorkOrders(FRESH)
      setOrders(res.data.workOrders)
      return
    }
    const res = await getMyLinkedCustomer(FRESH)
    const customerId = res.data.customers[0]?.id
    if (!customerId) {
      setOrders([])
      return
    }
    const res2 = await listWorkOrdersForCustomer({ customerId }, FRESH)
    setOrders(res2.data.workOrders.map((order) => ({ ...order, incidents: [] })))
  }, [profile])

  useEffect(() => {
    setLoadError(false)
    load().catch(() => setLoadError(true))
  }, [load])

  // This screen gets left open all day to watch orders move, so it refreshes
  // itself: every minute while it's on screen, and again the moment the tab
  // comes back. A failed background refresh keeps the rows already on screen
  // rather than blanking them - the next attempt is a minute away.
  useEffect(() => {
    if (!profile) return
    const refresh = () => {
      if (document.visibilityState === 'visible') load().catch(() => {})
    }
    const interval = setInterval(refresh, 60_000)
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      clearInterval(interval)
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [profile, load])

  useEffect(() => {
    if (!orders || !profile || !canChat) return
    return subscribeToUnreadOrderIds(
      'client',
      orders.map((o) => o.id),
      profile.id,
      setUnreadClientChatIds,
    )
  }, [orders, profile, canChat])

  useEffect(() => {
    if (!orders || !profile || !canChat) return
    return subscribeToUnreadOrderIds(
      'technicians',
      orders.map((o) => o.id),
      profile.id,
      setUnreadTechnicianChatIds,
    )
  }, [orders, profile, canChat])

  const filteredOrders = useMemo(() => {
    if (!orders) return null
    const boatQuery = boatFilter.trim().toLowerCase()
    const searchQuery = searchText.trim().toLowerCase()

    return orders.filter((order) => {
      if (!showDeleted && order.deletedAt) return false
      if (hideCompleted && order.status === WorkOrderStatus.COMPLETED) return false
      if (locationFilter !== 'ALL' && order.locationCode !== locationFilter) return false
      if (statusFilter !== 'ALL' && order.status !== statusFilter) return false
      if (adminProcessFilter !== 'ALL') {
        const step = ADMIN_PROCESS_FILTERS.find((f) => f.value === adminProcessFilter)
        if (step && !step.matches(order)) return false
      }
      if (boatQuery && !order.boat.name.toLowerCase().includes(boatQuery)) return false
      if (searchQuery) {
        const haystack =
          `${order.code} ${order.externalCode ?? ''} ${order.customer.name} ${order.boat.name} ${order.assetLocation}`.toLowerCase()
        if (!haystack.includes(searchQuery)) return false
      }
      return true
    })
  }, [
    orders,
    hideCompleted,
    showDeleted,
    locationFilter,
    statusFilter,
    adminProcessFilter,
    boatFilter,
    searchText,
  ])

  async function handleDelete(orderId: string) {
    await deleteWorkOrder(orderId)
    setConfirmingDeleteId(null)
    setOrders((prev) =>
      prev ? prev.map((o) => (o.id === orderId ? { ...o, deletedAt: new Date().toISOString() } : o)) : prev,
    )
  }

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

            {canDelete && (
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={showDeleted}
                  onChange={(e) => setShowDeleted(e.target.checked)}
                />
                Mostrar eliminadas
              </label>
            )}

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

            {canViewAdminProcess && (
              <label className="block text-xs font-medium text-slate-500">
                Gestión administrativa
                <select
                  value={adminProcessFilter}
                  onChange={(e) => setAdminProcessFilter(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 outline-none focus:border-eb-blue"
                >
                  <option value="ALL">Todas</option>
                  {ADMIN_PROCESS_FILTERS.map((step) => (
                    <option key={step.value} value={step.value}>
                      {step.label}
                    </option>
                  ))}
                </select>
              </label>
            )}

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
                placeholder="Código, nº gestor interno, cliente, embarcación, ubicación..."
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 outline-none focus:border-eb-blue"
              />
            </label>
          </div>
        )}
      </div>

      {loadError && orders === null && (
        <div className="mt-4 flex items-center justify-between gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
          <span>No se han podido cargar las órdenes.</span>
          <button
            onClick={() => {
              setLoadError(false)
              load().catch(() => setLoadError(true))
            }}
            className="shrink-0 font-semibold underline"
          >
            Reintentar
          </button>
        </div>
      )}
      {orders === null && !loadError && (
        <p className="mt-4 text-sm text-slate-500">Cargando...</p>
      )}

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
                onClick={() => navigate(`/orders/${order.id}`, { state: { from: listPath } })}
                className="min-w-0 flex-1 text-left"
              >
                {/* From sm up the status column (with the admin steps under
                    it) spans both rows, so the steps sit beside the customer
                    lines instead of pushing them down. On a phone there's no
                    room for that: the text takes the full width below. */}
                <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-2 sm:grid-rows-[auto_1fr]">
                  <p className="col-start-1 row-start-1 py-1 font-mono text-sm font-semibold text-eb-blue-dark">
                    {order.code}
                    {order.externalCode && (
                      <span className="ml-1.5 font-sans font-normal text-slate-400">
                        · {order.externalCode}
                      </span>
                    )}
                  </p>
                  <div className="col-span-2 row-start-2 min-w-0 break-words sm:col-span-1 sm:col-start-1">
                    <p className="text-sm text-slate-700">
                      {order.customer.name} · {order.boat.name}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {orderLocationLabel[order.locationCode]} · {order.assetLocation}
                    </p>
                    {order.tasks.length > 0 && (
                      <ul className="mt-1.5 space-y-0.5">
                        {order.tasks.map((task, i) => (
                          <li
                            key={i}
                            className={`flex items-start gap-1.5 text-xs ${
                              task.isCompleted ? 'text-slate-400 line-through' : 'text-slate-600'
                            }`}
                          >
                            <span
                              className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                                task.isCompleted ? 'bg-eb-teal' : 'bg-slate-300'
                              }`}
                            />
                            {task.description}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div className="col-start-2 row-start-1 flex flex-col items-end gap-1.5 sm:row-span-2">
                    <div className="flex items-center gap-2">
                      {order.incidents.length > 0 && (
                        <span
                          className="flex items-center gap-1 rounded-full bg-red-100 px-2 py-1 text-xs font-semibold text-red-700"
                          title="Incidencias reportadas"
                        >
                          <AlertTriangle className="h-3.5 w-3.5" />
                          {order.incidents.length}
                        </span>
                      )}
                      {order.deletedAt && (
                        <span className="rounded-full bg-slate-200 px-2.5 py-1 text-xs text-slate-600">
                          Eliminada
                        </span>
                      )}
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs ${workOrderStatusColor[order.status]}`}
                      >
                        {workOrderStatusLabel[order.status]}
                      </span>
                    </div>
                    {canViewAdminProcess && order.status === WorkOrderStatus.COMPLETED && (
                      <AdminProcessSteps order={order} />
                    )}
                  </div>
                </div>
              </button>
              <HasPermission permission="chat:write">
                <button
                  onClick={() =>
                    navigate(`/chat/client/${order.id}`, { state: { from: listPath } })
                  }
                  className="relative rounded-lg border border-slate-300 p-2 text-slate-500 hover:border-eb-blue hover:text-eb-blue"
                  title="Chat con el cliente"
                >
                  <MessageCircle className="h-4 w-4" />
                  {unreadClientChatIds.has(order.id) && (
                    <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-red-500" />
                  )}
                </button>
              </HasPermission>
              <HasPermission permission="chat:write">
                <button
                  onClick={() =>
                    navigate(`/chat/technicians/${order.id}`, { state: { from: listPath } })
                  }
                  className="relative rounded-lg border border-slate-300 p-2 text-slate-500 hover:border-eb-blue hover:text-eb-blue"
                  title="Chat con técnicos"
                >
                  <Wrench className="h-4 w-4" />
                  {unreadTechnicianChatIds.has(order.id) && (
                    <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-red-500" />
                  )}
                </button>
              </HasPermission>
              {canDelete && !order.deletedAt && (
                <button
                  onClick={() => setConfirmingDeleteId(order.id)}
                  className="rounded-lg border border-slate-300 p-2 text-slate-500 hover:border-red-400 hover:text-red-600"
                  title="Eliminar orden"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>

            {confirmingDeleteId === order.id && (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3">
                <p className="text-xs text-red-700">
                  ¿Eliminar la orden {order.code}? Pasará a estar inactiva: seguirá pudiendo
                  buscarse marcando "Mostrar eliminadas" en los filtros, pero no aparecerá en la
                  lista por defecto. Queda registrado en el historial de la orden.
                </p>
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={() => setConfirmingDeleteId(null)}
                    className="flex-1 rounded-lg border border-slate-300 py-1.5 text-sm text-slate-600"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => handleDelete(order.id)}
                    className="flex-1 rounded-lg bg-red-600 py-1.5 text-sm font-semibold text-white"
                  >
                    Eliminar
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
