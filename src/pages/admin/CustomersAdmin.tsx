import { useEffect, useState } from 'react'
import {
  UserRole,
  createCustomer,
  listCustomers,
  listUsers,
  listWorkOrdersForCustomer,
  updateCustomer,
  type ListCustomersData,
  type ListUsersData,
} from '@dataconnect/generated'
import { SearchInput } from '../../components/SearchInput'
import { setChatParticipants } from '../../lib/chat'
import { FRESH } from '../../lib/dataConnectOptions'

type CustomerRow = ListCustomersData['customers'][number]
type ClientUsers = ListUsersData['users']

const inputClass =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 outline-none focus:border-eb-blue'

function CustomerForm({
  customer,
  clientUsers,
  onSaved,
}: {
  customer?: CustomerRow
  clientUsers: ClientUsers
  onSaved: () => void
}) {
  const [name, setName] = useState(customer?.name ?? '')
  const [contactName, setContactName] = useState(customer?.contactName ?? '')
  const [phone, setPhone] = useState(customer?.phone ?? '')
  const [email, setEmail] = useState(customer?.email ?? '')
  const [linkedUserId, setLinkedUserId] = useState(customer?.linkedUserId ?? '')
  const [submitting, setSubmitting] = useState(false)

  const canSubmit = name.trim() && contactName.trim() && phone.trim()

  async function handleSubmit() {
    setSubmitting(true)
    try {
      if (customer) {
        await updateCustomer({
          id: customer.id,
          name: name.trim(),
          contactName: contactName.trim(),
          phone: phone.trim(),
          email: email.trim() || undefined,
          linkedUserId: linkedUserId || null,
        })
        // The client chat's participant list is seeded once at order-creation
        // time (see NewOrderPage), so it never picks up a linkedUserId set or
        // changed afterwards - backfill it here for every existing order of
        // this customer.
        if (linkedUserId !== (customer.linkedUserId ?? '')) {
          const { data } = await listWorkOrdersForCustomer({ customerId: customer.id }, FRESH)
          await Promise.all(
            data.workOrders.map((order) =>
              setChatParticipants('client', order.id, linkedUserId ? [linkedUserId] : []),
            ),
          )
        }
      } else {
        await createCustomer({
          name: name.trim(),
          contactName: contactName.trim(),
          phone: phone.trim(),
          email: email.trim() || undefined,
        })
      }
      onSaved()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mt-3 space-y-3 border-t border-slate-200 pt-3 first:mt-0 first:border-t-0 first:pt-0">
      <input
        placeholder="Nombre de empresa/particular"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className={inputClass}
      />
      <input
        placeholder="Nombre del responsable"
        value={contactName}
        onChange={(e) => setContactName(e.target.value)}
        className={inputClass}
      />
      <input
        placeholder="Teléfono"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        className={inputClass}
      />
      <input
        placeholder="Email (opcional)"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className={inputClass}
      />
      {customer && (
        <label className="block text-xs font-medium text-slate-500">
          Usuario del portal (para el chat con el cliente)
          <select
            value={linkedUserId}
            onChange={(e) => setLinkedUserId(e.target.value)}
            className={`mt-1 ${inputClass}`}
          >
            <option value="">Sin vincular</option>
            {clientUsers.map((u) => (
              <option key={u.id} value={u.id}>
                {u.displayName} ({u.email})
              </option>
            ))}
          </select>
        </label>
      )}
      <button
        disabled={!canSubmit || submitting}
        onClick={handleSubmit}
        className="w-full rounded-lg bg-eb-blue py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        {submitting ? 'Guardando...' : customer ? 'Guardar cambios' : 'Crear cliente'}
      </button>
    </div>
  )
}

export function CustomersAdmin() {
  const [customers, setCustomers] = useState<ListCustomersData['customers'] | null>(null)
  const [clientUsers, setClientUsers] = useState<ClientUsers>([])
  const [creating, setCreating] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  async function refresh() {
    const [customersRes, usersRes] = await Promise.all([listCustomers(FRESH), listUsers(FRESH)])
    setCustomers(customersRes.data.customers)
    setClientUsers(usersRes.data.users.filter((u) => u.role === UserRole.CLIENT))
  }

  useEffect(() => {
    refresh()
  }, [])

  const query = search.trim().toLowerCase()
  const filteredCustomers = customers?.filter(
    (customer) =>
      !query ||
      customer.name.toLowerCase().includes(query) ||
      customer.contactName.toLowerCase().includes(query) ||
      customer.phone.toLowerCase().includes(query) ||
      customer.email?.toLowerCase().includes(query),
  )

  return (
    <div>
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">{customers?.length ?? 0} clientes</p>
        <button
          onClick={() => setCreating((v) => !v)}
          className="rounded-lg bg-eb-teal px-3 py-1.5 text-sm font-semibold text-white"
        >
          {creating ? 'Cancelar' : '+ Nuevo cliente'}
        </button>
      </div>

      <div className="mt-3">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Buscar por nombre, contacto, teléfono o email..."
        />
      </div>

      {creating && (
        <CustomerForm
          clientUsers={clientUsers}
          onSaved={() => {
            setCreating(false)
            refresh()
          }}
        />
      )}

      <div className="mt-4 space-y-2">
        {filteredCustomers?.map((customer) => (
          <div key={customer.id} className="rounded-xl border border-slate-200 bg-white/90 p-4">
            <button
              onClick={() => setEditingId(editingId === customer.id ? null : customer.id)}
              className="flex w-full items-center justify-between text-left"
            >
              <div>
                <p className="text-sm font-semibold text-eb-blue-dark">{customer.name}</p>
                <p className="text-xs text-slate-500">
                  {customer.contactName} · {customer.phone}
                </p>
                {customer.boats.length > 0 && (
                  <ul className="mt-2 flex flex-wrap gap-1.5">
                    {customer.boats.map((boat) => (
                      <li
                        key={boat.id}
                        className="rounded-full bg-eb-teal/10 px-2.5 py-0.5 text-xs text-eb-teal-dark"
                      >
                        {boat.name}
                        {boat.registrationNumber ? ` · ${boat.registrationNumber}` : ''}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </button>
            {editingId === customer.id && (
              <CustomerForm
                customer={customer}
                clientUsers={clientUsers}
                onSaved={() => {
                  setEditingId(null)
                  refresh()
                }}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
