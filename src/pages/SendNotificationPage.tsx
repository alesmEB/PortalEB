import { useEffect, useState } from 'react'
import { listUsers, type ListUsersData } from '@dataconnect/generated'
import { BackButton } from '../components/BackButton'
import { FRESH } from '../lib/dataConnectOptions'
import { sendPushNotification } from '../lib/pushNotifications'

type UserRow = ListUsersData['users'][number]

const inputClass =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 outline-none focus:border-eb-blue'

export function SendNotificationPage() {
  const [users, setUsers] = useState<UserRow[] | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  useEffect(() => {
    listUsers(FRESH).then((res) => setUsers(res.data.users))
  }, [])

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const canSend = selected.size > 0 && title.trim() && body.trim()

  async function handleSend() {
    setSending(true)
    setResult(null)
    try {
      const res = await sendPushNotification({
        userIds: [...selected],
        title: title.trim(),
        body: body.trim(),
      })
      setResult(`Enviada a ${res.sent} dispositivo(s)${res.failed > 0 ? ` · ${res.failed} fallidas` : ''}.`)
      setTitle('')
      setBody('')
      setSelected(new Set())
    } catch {
      setResult('No se pudo enviar la notificación.')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex-1 p-4">
      <BackButton to="/" />
      <h1 className="text-lg font-semibold text-eb-blue-dark">Enviar notificación push</h1>
      <p className="text-sm text-slate-500">
        Selecciona los destinatarios y escribe el contenido de la notificación.
      </p>

      <div className="mt-4 rounded-xl border border-slate-200 bg-white/90 p-4">
        <p className="text-xs font-medium text-slate-500">Destinatarios ({selected.size})</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {users?.map((user) => (
            <label
              key={user.id}
              className={`cursor-pointer rounded-full border px-2.5 py-1 text-xs ${
                selected.has(user.id)
                  ? 'border-eb-blue bg-eb-blue text-white'
                  : 'border-slate-300 text-slate-600'
              }`}
            >
              <input
                type="checkbox"
                className="hidden"
                checked={selected.has(user.id)}
                onChange={() => toggle(user.id)}
              />
              {user.displayName}
            </label>
          ))}
        </div>

        <div className="mt-4 space-y-3">
          <input
            placeholder="Título"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={inputClass}
          />
          <textarea
            placeholder="Contenido"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={4}
            className={inputClass}
          />
        </div>

        {result && <p className="mt-3 text-sm text-slate-600">{result}</p>}

        <button
          disabled={!canSend || sending}
          onClick={handleSend}
          className="mt-4 w-full rounded-lg bg-eb-blue py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {sending ? 'Enviando...' : 'Enviar notificación'}
        </button>
      </div>
    </div>
  )
}
