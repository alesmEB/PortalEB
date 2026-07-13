import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { useLocation, useParams } from 'react-router-dom'
import { Camera, FileText, Images, Paperclip, Video, X } from 'lucide-react'
import { MediaType } from '@dataconnect/generated'
import { BackButton } from '../components/BackButton'
import { useAuth } from '../contexts/AuthContext'
import {
  markChatRead,
  sendChatMessage,
  subscribeToMessages,
  type ChatAttachmentType,
  type ChatKind,
  type ChatMessage,
} from '../lib/chat'
import { uploadChatMedia } from '../lib/chatStorage'
import { DOCUMENT_ACCEPT, mediaTypeOf, validateDocumentFile, validateMediaFile } from '../lib/media'

const titleByKind: Record<ChatKind, string> = {
  client: 'Chat con el cliente',
  technicians: 'Chat con técnicos',
}

type PendingAttachment = { file: File; type: ChatAttachmentType }

export function ChatPage() {
  const { kind, orderId } = useParams<{ kind: ChatKind; orderId: string }>()
  const location = useLocation()
  const backTo = (location.state as { from?: string } | null)?.from ?? '/orders'
  const { profile } = useAuth()
  const [messages, setMessages] = useState<ChatMessage[] | null>(null)
  const [text, setText] = useState('')
  const [pending, setPending] = useState<PendingAttachment | null>(null)
  const [mediaError, setMediaError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  const previewUrl = useMemo(
    () => (pending?.type === 'PHOTO' ? URL.createObjectURL(pending.file) : null),
    [pending],
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

  async function handleMediaSelected(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const err = await validateMediaFile(file)
    if (err) {
      setMediaError(err)
      return
    }
    setMediaError(null)
    setPending({ file, type: mediaTypeOf(file) === MediaType.VIDEO ? 'VIDEO' : 'PHOTO' })
  }

  function handleDocumentSelected(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const err = validateDocumentFile(file)
    if (err) {
      setMediaError(err)
      return
    }
    setMediaError(null)
    setPending({ file, type: 'FILE' })
  }

  async function handleSend() {
    if (!kind || !orderId || !profile) return
    if (!text.trim() && !pending) return
    setSending(true)
    try {
      let attachment: { url: string; type: ChatAttachmentType; name: string } | undefined
      if (pending) {
        const url = await uploadChatMedia(kind, orderId, pending.file)
        attachment = { url, type: pending.type, name: pending.file.name }
      }
      await sendChatMessage(kind, orderId, profile.id, profile.displayName, text.trim(), attachment)
      setText('')
      setPending(null)
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
                {message.attachmentUrl && message.attachmentType === 'PHOTO' && (
                  <img
                    src={message.attachmentUrl}
                    alt=""
                    onClick={() => window.open(message.attachmentUrl, '_blank')}
                    className="mt-1 max-h-64 cursor-pointer rounded-lg"
                  />
                )}
                {message.attachmentUrl && message.attachmentType === 'VIDEO' && (
                  <video src={message.attachmentUrl} controls className="mt-1 max-h-64 rounded-lg" />
                )}
                {message.attachmentUrl && message.attachmentType === 'FILE' && (
                  <a
                    href={message.attachmentUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`mt-1 flex items-center gap-2 rounded-lg border p-2 ${
                      isMine ? 'border-white/30' : 'border-slate-300'
                    }`}
                  >
                    <FileText className="h-5 w-5 shrink-0" />
                    <span className="truncate text-xs underline">
                      {message.attachmentName ?? 'Documento'}
                    </span>
                  </a>
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

      {pending && (
        <div className="mt-2 flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2">
          {previewUrl ? (
            <img src={previewUrl} alt="" className="h-10 w-10 rounded object-cover" />
          ) : pending.type === 'VIDEO' ? (
            <Video className="h-8 w-8 text-slate-400" />
          ) : (
            <FileText className="h-8 w-8 text-slate-400" />
          )}
          <span className="flex-1 truncate text-xs text-slate-600">{pending.file.name}</span>
          <button onClick={() => setPending(null)} className="text-slate-400 hover:text-red-600">
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
            onChange={handleMediaSelected}
          />
        </label>
        <label className="cursor-pointer rounded-lg border border-slate-300 p-2 text-slate-500 hover:border-eb-blue hover:text-eb-blue">
          <Video className="h-5 w-5" />
          <input
            type="file"
            accept="video/*"
            capture="environment"
            className="hidden"
            onChange={handleMediaSelected}
          />
        </label>
        <label className="cursor-pointer rounded-lg border border-slate-300 p-2 text-slate-500 hover:border-eb-blue hover:text-eb-blue">
          <Images className="h-5 w-5" />
          <input type="file" accept="image/*,video/*" className="hidden" onChange={handleMediaSelected} />
        </label>
        <label className="cursor-pointer rounded-lg border border-slate-300 p-2 text-slate-500 hover:border-eb-blue hover:text-eb-blue">
          <Paperclip className="h-5 w-5" />
          <input type="file" accept={DOCUMENT_ACCEPT} className="hidden" onChange={handleDocumentSelected} />
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
          disabled={(!text.trim() && !pending) || sending}
          onClick={handleSend}
          className="shrink-0 rounded-lg bg-eb-blue px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {sending ? '...' : 'Enviar'}
        </button>
      </div>
    </div>
  )
}
