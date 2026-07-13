import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { useLocation, useParams } from 'react-router-dom'
import { Camera, Images, Video, X } from 'lucide-react'
import { MediaType } from '@dataconnect/generated'
import { BackButton } from '../components/BackButton'
import { useAuth } from '../contexts/AuthContext'
import {
  markChatRead,
  sendChatMessage,
  subscribeToMessages,
  type ChatKind,
  type ChatMessage,
} from '../lib/chat'
import { uploadChatMedia } from '../lib/chatStorage'
import { mediaTypeOf, validateMediaFile } from '../lib/media'

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
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [mediaError, setMediaError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  const previewUrl = useMemo(
    () => (pendingFile && mediaTypeOf(pendingFile) === MediaType.PHOTO ? URL.createObjectURL(pendingFile) : null),
    [pendingFile],
  )
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl) }, [previewUrl])

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

  async function handleFileSelected(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const err = await validateMediaFile(file)
    if (err) {
      setMediaError(err)
      return
    }
    setMediaError(null)
    setPendingFile(file)
  }

  async function handleSend() {
    if (!kind || !orderId || !profile) return
    if (!text.trim() && !pendingFile) return
    setSending(true)
    try {
      let media: { url: string; type: MediaType } | undefined
      if (pendingFile) {
        const url = await uploadChatMedia(kind, orderId, pendingFile)
        media = { url, type: mediaTypeOf(pendingFile) }
      }
      await sendChatMessage(kind, orderId, profile.id, profile.displayName, text.trim(), media)
      setText('')
      setPendingFile(null)
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
                {message.mediaUrl && message.mediaType === MediaType.PHOTO && (
                  <img
                    src={message.mediaUrl}
                    alt=""
                    onClick={() => window.open(message.mediaUrl, '_blank')}
                    className="mt-1 max-h-64 cursor-pointer rounded-lg"
                  />
                )}
                {message.mediaUrl && message.mediaType === MediaType.VIDEO && (
                  <video src={message.mediaUrl} controls className="mt-1 max-h-64 rounded-lg" />
                )}
                {message.text && <p className="mt-1 whitespace-pre-wrap">{message.text}</p>}
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

      {mediaError && <p className="mt-2 text-xs text-red-600">{mediaError}</p>}

      {pendingFile && (
        <div className="mt-2 flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2">
          {previewUrl ? (
            <img src={previewUrl} alt="" className="h-10 w-10 rounded object-cover" />
          ) : (
            <Video className="h-8 w-8 text-slate-400" />
          )}
          <span className="flex-1 truncate text-xs text-slate-600">{pendingFile.name}</span>
          <button onClick={() => setPendingFile(null)} className="text-slate-400 hover:text-red-600">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="mt-3 flex items-center gap-2">
        <label className="cursor-pointer rounded-lg border border-slate-300 p-2 text-slate-500 hover:border-eb-blue hover:text-eb-blue">
          <Camera className="h-5 w-5" />
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleFileSelected}
          />
        </label>
        <label className="cursor-pointer rounded-lg border border-slate-300 p-2 text-slate-500 hover:border-eb-blue hover:text-eb-blue">
          <Video className="h-5 w-5" />
          <input
            type="file"
            accept="video/*"
            capture="environment"
            className="hidden"
            onChange={handleFileSelected}
          />
        </label>
        <label className="cursor-pointer rounded-lg border border-slate-300 p-2 text-slate-500 hover:border-eb-blue hover:text-eb-blue">
          <Images className="h-5 w-5" />
          <input type="file" accept="image/*,video/*" className="hidden" onChange={handleFileSelected} />
        </label>
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
          className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-eb-blue"
        />
        <button
          disabled={(!text.trim() && !pendingFile) || sending}
          onClick={handleSend}
          className="shrink-0 rounded-lg bg-eb-blue px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {sending ? '...' : 'Enviar'}
        </button>
      </div>
    </div>
  )
}
