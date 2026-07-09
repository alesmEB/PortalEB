import { useEffect, useRef, useState } from 'react'
import { useLocation, useParams } from 'react-router-dom'
import { BackButton } from '../components/BackButton'
import { useAuth } from '../contexts/AuthContext'
import {
  markChatRead,
  sendChatMessage,
  subscribeToMessages,
  type ChatKind,
  type ChatMessage,
} from '../lib/chat'

const titleByKind: Record<ChatKind, string> = {
  client: 'Chat con el cliente',
  technicians: 'Chat con técnicos',
}

export function ChatPage() {
  const { kind, orderId } = useParams<{ kind: ChatKind; orderId: string }>()
  const location = useLocation()
  const backTo = (location.state as { from?: string } | null)?.from ?? '/orders'
  const { profile } = useAuth()
  const [messages, setMessages] = useState<ChatMessage[] | null>(null)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!kind || !orderId) return
    return subscribeToMessages(kind, orderId, setMessages)
  }, [kind, orderId])

  useEffect(() => {
    if (kind && orderId && profile) markChatRead(kind, orderId, profile.id)
  }, [kind, orderId, profile, messages?.length])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages?.length])

  async function handleSend() {
    if (!kind || !orderId || !profile || !text.trim()) return
    setSending(true)
    try {
      await sendChatMessage(kind, orderId, profile.id, profile.displayName, text.trim())
      setText('')
    } finally {
      setSending(false)
    }
  }

  if (!kind || !orderId) return null

  return (
    <div className="flex flex-1 flex-col p-4">
      <BackButton to={backTo} />
      <h1 className="text-lg font-semibold text-eb-blue-dark">{titleByKind[kind]}</h1>

      <div className="mt-4 flex-1 space-y-2 overflow-y-auto rounded-xl border border-slate-200 bg-white/90 p-4">
        {messages === null && <p className="text-sm text-slate-500">Cargando...</p>}
        {messages?.length === 0 && (
          <p className="text-sm text-slate-500">Todavía no hay mensajes.</p>
        )}
        {messages?.map((message) => {
          const isMine = message.senderId === profile?.id
          return (
            <div key={message.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[80%] rounded-xl px-3 py-2 text-sm ${
                  isMine ? 'bg-eb-blue text-white' : 'bg-slate-100 text-slate-700'
                }`}
              >
                {!isMine && (
                  <p className="text-xs font-semibold opacity-70">{message.senderName}</p>
                )}
                <p className="whitespace-pre-wrap">{message.text}</p>
                {message.createdAt && (
                  <p className={`mt-1 text-[10px] ${isMine ? 'text-white/70' : 'text-slate-400'}`}>
                    {message.createdAt.toDate().toLocaleString('es-ES')}
                  </p>
                )}
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      <div className="mt-3 flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              handleSend()
            }
          }}
          placeholder="Escribe un mensaje..."
          className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-eb-blue"
        />
        <button
          disabled={!text.trim() || sending}
          onClick={handleSend}
          className="rounded-lg bg-eb-blue px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          Enviar
        </button>
      </div>
    </div>
  )
}
