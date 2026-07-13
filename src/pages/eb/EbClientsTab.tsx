import { useEffect, useState } from 'react'
import {
  UserRole,
  listEbClients,
  listUsers,
  type ListEbClientsData,
  type ListUsersData,
} from '@dataconnect/generated'
import { SearchInput } from '../../components/SearchInput'
import { FRESH } from '../../lib/dataConnectOptions'
import { ebCreateClient, ebDeleteClient, ebUpdateClient } from '../../lib/ebEngineering'

type ClientRow = ListEbClientsData['ebClients'][number]
type PortalUsers = ListUsersData['users']

const inputClass =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 outline-none focus:border-eb-blue'

function ClientForm({
  client,
  clients,
  portalUsers,
  onSaved,
  onCancel,
}: {
  client?: ClientRow
  clients: ClientRow[]
  portalUsers: PortalUsers
  onSaved: () => void
  onCancel: () => void
}) {
  const [email, setEmail] = useState(client?.email ?? '')
  const [companyName, setCompanyName] = useState(client?.companyName ?? '')
  const [contactName, setContactName] = useState(client?.contactName ?? '')
  const [phone, setPhone] = useState(client?.phone ?? '')
  const [country, setCountry] = useState(client?.country ?? '')
  const [distributorId, setDistributorId] = useState(client?.distributorId ?? '')
  const [linkedUserId, setLinkedUserId] = useState(client?.linkedUserId ?? '')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canSubmit =
    email.trim() && companyName.trim() && contactName.trim() && phone.trim() && country.trim()

  async function handleSubmit() {
    setSubmitting(true)
    setError(null)
    try {
      const input = {
        email: email.trim(),
        companyName: companyName.trim(),
        contactName: contactName.trim(),
        phone: phone.trim(),
        country: country.trim(),
        distributorId: distributorId || undefined,
        linkedUserId: linkedUserId || undefined,
      }
      if (client) {
        await ebUpdateClient({ clientId: client.id, ...input })
      } else {
        await ebCreateClient(input)
      }
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar.')
    } finally {
      setSubmitting(false)
    }
  }

  const distributorOptions = clients.filter((c) => c.id !== client?.id)

  return (
    <div className="mt-3 space-y-3 border-t border-slate-200 pt-3 first:mt-0 first:border-t-0 first:pt-0">
      <input
        placeholder="Nombre de la empresa"
        value={companyName}
        onChange={(e) => setCompanyName(e.target.value)}
        className={inputClass}
      />
      <input
        placeholder="Nombre del responsable"
        value={contactName}
        onChange={(e) => setContactName(e.target.value)}
        className={inputClass}
      />
      <input
        placeholder="Email"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className={inputClass}
      />
      <input
        placeholder="Teléfono"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        className={inputClass}
      />
      <input
        placeholder="País"
        value={country}
        onChange={(e) => setCountry(e.target.value)}
        className={inputClass}
      />
      <label className="block text-xs font-medium text-slate-500">
        Distribuidor (opcional, si este cliente compra a través de otro)
        <select
          value={distributorId}
          onChange={(e) => setDistributorId(e.target.value)}
          className={`mt-1 ${inputClass}`}
        >
          <option value="">Ninguno</option>
          {distributorOptions.map((c) => (
            <option key={c.id} value={c.id}>
              {c.companyName}
            </option>
          ))}
        </select>
      </label>
      {client && (
        <label className="block text-xs font-medium text-slate-500">
          Usuario del portal (para que el cliente vea sus productos)
          <select
            value={linkedUserId}
            onChange={(e) => setLinkedUserId(e.target.value)}
            className={`mt-1 ${inputClass}`}
          >
            <option value="">Sin vincular</option>
            {portalUsers.map((u) => (
              <option key={u.id} value={u.id}>
                {u.displayName} ({u.email})
              </option>
            ))}
          </select>
        </label>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button
          onClick={onCancel}
          className="flex-1 rounded-lg border border-slate-300 py-2 text-sm text-slate-600"
        >
          Cancelar
        </button>
        <button
          disabled={!canSubmit || submitting}
          onClick={handleSubmit}
          className="flex-1 rounded-lg bg-eb-blue py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {submitting ? 'Guardando...' : client ? 'Guardar cambios' : 'Crear cliente'}
        </button>
      </div>
    </div>
  )
}

export function EbClientsTab() {
  const [clients, setClients] = useState<ClientRow[] | null>(null)
  const [portalUsers, setPortalUsers] = useState<PortalUsers>([])
  const [creating, setCreating] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  async function refresh() {
    const [clientsRes, usersRes] = await Promise.all([listEbClients(FRESH), listUsers(FRESH)])
    setClients(clientsRes.data.ebClients)
    setPortalUsers(usersRes.data.users.filter((u) => u.role === UserRole.CLIENT))
  }

  useEffect(() => {
    refresh()
  }, [])

  const query = search.trim().toLowerCase()
  const filteredClients = clients?.filter(
    (client) =>
      !query ||
      client.companyName.toLowerCase().includes(query) ||
      client.contactName.toLowerCase().includes(query) ||
      client.country.toLowerCase().includes(query),
  )

  return (
    <div>
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">{clients?.length ?? 0} clientes</p>
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
          placeholder="Buscar por empresa, responsable o país..."
        />
      </div>

      {creating && (
        <ClientForm
          clients={clients ?? []}
          portalUsers={portalUsers}
          onSaved={() => { setCreating(false); refresh() }}
          onCancel={() => setCreating(false)}
        />
      )}

      <div className="mt-4 space-y-2">
        {filteredClients?.map((client) => (
          <div key={client.id} className="rounded-xl border border-slate-200 bg-white/90 p-4">
            <div className="flex items-start justify-between gap-2">
              <button
                onClick={() => setEditingId(editingId === client.id ? null : client.id)}
                className="flex-1 text-left"
              >
                <p className="text-sm font-semibold text-eb-blue-dark">{client.companyName}</p>
                <p className="text-xs text-slate-500">
                  {client.contactName} · {client.phone} · {client.country}
                </p>
                <p className="text-xs text-slate-400">{client.email}</p>
                {client.distributor && (
                  <p className="mt-1 text-[11px] text-eb-teal-dark">
                    Vía distribuidor: {client.distributor.companyName}
                  </p>
                )}
                {client.linkedUser && (
                  <p className="text-[11px] text-slate-400">
                    Portal: {client.linkedUser.displayName}
                  </p>
                )}
              </button>
              <button
                onClick={() => setConfirmingDeleteId(client.id)}
                className="text-slate-400 hover:text-red-600"
                title="Eliminar cliente"
              >
                ✕
              </button>
            </div>

            {confirmingDeleteId === client.id && (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3">
                <p className="text-xs text-red-700">
                  ¿Eliminar "{client.companyName}" y todos sus productos? Esta acción no se puede deshacer.
                </p>
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={() => setConfirmingDeleteId(null)}
                    className="flex-1 rounded-lg border border-slate-300 py-1.5 text-sm text-slate-600"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => ebDeleteClient(client.id).then(() => { setConfirmingDeleteId(null); refresh() })}
                    className="flex-1 rounded-lg bg-red-600 py-1.5 text-sm font-semibold text-white"
                  >
                    Eliminar
                  </button>
                </div>
              </div>
            )}

            {editingId === client.id && (
              <ClientForm
                client={client}
                clients={clients ?? []}
                portalUsers={portalUsers}
                onSaved={() => { setEditingId(null); refresh() }}
                onCancel={() => setEditingId(null)}
              />
            )}
          </div>
        ))}
        {filteredClients?.length === 0 && (
          <p className="text-xs text-slate-400">Ningún cliente todavía.</p>
        )}
      </div>
    </div>
  )
}
