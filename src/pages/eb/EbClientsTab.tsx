import { useEffect, useState } from 'react'
import { listEbClients, type ListEbClientsData } from '@dataconnect/generated'
import { SearchInput } from '../../components/SearchInput'
import { FRESH } from '../../lib/dataConnectOptions'
import {
  ebAddClientProduct,
  ebCreateClient,
  ebDeleteClient,
  ebDeleteClientProduct,
  ebUpdateClient,
} from '../../lib/ebEngineering'

type ClientRow = ListEbClientsData['ebClients'][number]

const inputClass =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 outline-none focus:border-eb-blue'

function ClientForm({
  client,
  onSaved,
  onCancel,
}: {
  client?: ClientRow
  onSaved: () => void
  onCancel: () => void
}) {
  const [name, setName] = useState(client?.name ?? '')
  const [contactName, setContactName] = useState(client?.contactName ?? '')
  const [phone, setPhone] = useState(client?.phone ?? '')
  const [email, setEmail] = useState(client?.email ?? '')
  const [notes, setNotes] = useState(client?.notes ?? '')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit() {
    setSubmitting(true)
    try {
      const input = {
        name: name.trim(),
        contactName: contactName.trim() || undefined,
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        notes: notes.trim() || undefined,
      }
      if (client) {
        await ebUpdateClient({ clientId: client.id, ...input })
      } else {
        await ebCreateClient(input)
      }
      onSaved()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mt-3 space-y-3 border-t border-slate-200 pt-3 first:mt-0 first:border-t-0 first:pt-0">
      <input
        placeholder="Nombre del cliente"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className={inputClass}
      />
      <input
        placeholder="Persona de contacto (opcional)"
        value={contactName}
        onChange={(e) => setContactName(e.target.value)}
        className={inputClass}
      />
      <input
        placeholder="Teléfono (opcional)"
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
      <textarea
        placeholder="Notas (opcional)"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={2}
        className={inputClass}
      />
      <div className="flex gap-2">
        <button
          onClick={onCancel}
          className="flex-1 rounded-lg border border-slate-300 py-2 text-sm text-slate-600"
        >
          Cancelar
        </button>
        <button
          disabled={!name.trim() || submitting}
          onClick={handleSubmit}
          className="flex-1 rounded-lg bg-eb-blue py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {submitting ? 'Guardando...' : client ? 'Guardar cambios' : 'Crear cliente'}
        </button>
      </div>
    </div>
  )
}

function AddProductForm({ clientId, onAdded }: { clientId: string; onAdded: () => void }) {
  const [productName, setProductName] = useState('')
  const [purchasedAt, setPurchasedAt] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleAdd() {
    setSubmitting(true)
    try {
      await ebAddClientProduct({
        clientId,
        productName: productName.trim(),
        purchasedAt: purchasedAt || undefined,
        notes: notes.trim() || undefined,
      })
      setProductName('')
      setPurchasedAt('')
      setNotes('')
      onAdded()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mt-2 flex flex-wrap gap-2">
      <input
        placeholder="Producto"
        value={productName}
        onChange={(e) => setProductName(e.target.value)}
        className={`${inputClass} flex-1 basis-32`}
      />
      <input
        type="date"
        value={purchasedAt}
        onChange={(e) => setPurchasedAt(e.target.value)}
        className={`${inputClass} basis-36`}
      />
      <input
        placeholder="Notas (opcional)"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        className={`${inputClass} flex-1 basis-32`}
      />
      <button
        disabled={!productName.trim() || submitting}
        onClick={handleAdd}
        className="rounded-lg bg-eb-teal px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
      >
        + Añadir
      </button>
    </div>
  )
}

export function EbClientsTab() {
  const [clients, setClients] = useState<ClientRow[] | null>(null)
  const [creating, setCreating] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  function refresh() {
    listEbClients(FRESH).then((res) => setClients(res.data.ebClients))
  }

  useEffect(() => {
    refresh()
  }, [])

  const query = search.trim().toLowerCase()
  const filteredClients = clients?.filter(
    (client) => !query || client.name.toLowerCase().includes(query),
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
        <SearchInput value={search} onChange={setSearch} placeholder="Buscar por nombre..." />
      </div>

      {creating && <ClientForm onSaved={() => { setCreating(false); refresh() }} onCancel={() => setCreating(false)} />}

      <div className="mt-4 space-y-2">
        {filteredClients?.map((client) => (
          <div key={client.id} className="rounded-xl border border-slate-200 bg-white/90 p-4">
            <div className="flex items-start justify-between gap-2">
              <button
                onClick={() => setEditingId(editingId === client.id ? null : client.id)}
                className="flex-1 text-left"
              >
                <p className="text-sm font-semibold text-eb-blue-dark">{client.name}</p>
                {(client.contactName || client.phone) && (
                  <p className="text-xs text-slate-500">
                    {[client.contactName, client.phone].filter(Boolean).join(' · ')}
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
                  ¿Eliminar "{client.name}" y todos sus productos? Esta acción no se puede deshacer.
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
                onSaved={() => { setEditingId(null); refresh() }}
                onCancel={() => setEditingId(null)}
              />
            )}

            <div className="mt-3 border-t border-slate-200 pt-3">
              <p className="text-xs font-medium text-slate-500">Productos comprados</p>
              {client.products.length === 0 && (
                <p className="mt-1 text-xs text-slate-400">Ninguno todavía.</p>
              )}
              <ul className="mt-1 space-y-1">
                {client.products.map((product) => (
                  <li
                    key={product.id}
                    className="flex items-center justify-between gap-2 text-xs text-slate-600"
                  >
                    <span>
                      {product.productName}
                      {product.purchasedAt ? ` · ${product.purchasedAt}` : ''}
                      {product.notes ? ` · ${product.notes}` : ''}
                    </span>
                    <button
                      onClick={() => ebDeleteClientProduct(product.id).then(refresh)}
                      className="text-slate-400 hover:text-red-600"
                      title="Eliminar producto"
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
              <AddProductForm clientId={client.id} onAdded={refresh} />
            </div>
          </div>
        ))}
        {filteredClients?.length === 0 && (
          <p className="text-xs text-slate-400">Ningún cliente todavía.</p>
        )}
      </div>
    </div>
  )
}
