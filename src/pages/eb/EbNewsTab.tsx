import { useEffect, useState } from 'react'
import { listEbNewsPosts, type ListEbNewsPostsData } from '@dataconnect/generated'
import { FRESH } from '../../lib/dataConnectOptions'
import { ebCreateNewsPost, ebDeleteNewsPost } from '../../lib/ebEngineering'

type NewsPost = ListEbNewsPostsData['ebNewsPosts'][number]

const inputClass =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 outline-none focus:border-eb-blue'

function NewPostForm({ onSaved, onCancel }: { onSaved: () => void; onCancel: () => void }) {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit() {
    setSubmitting(true)
    try {
      await ebCreateNewsPost({ title: title.trim(), body: body.trim() })
      onSaved()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mt-3 space-y-3 border-t border-slate-200 pt-3 first:mt-0 first:border-t-0 first:pt-0">
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
      <div className="flex gap-2">
        <button
          onClick={onCancel}
          className="flex-1 rounded-lg border border-slate-300 py-2 text-sm text-slate-600"
        >
          Cancelar
        </button>
        <button
          disabled={!title.trim() || !body.trim() || submitting}
          onClick={handleSubmit}
          className="flex-1 rounded-lg bg-eb-blue py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {submitting ? 'Publicando...' : 'Publicar'}
        </button>
      </div>
    </div>
  )
}

export function EbNewsTab() {
  const [posts, setPosts] = useState<NewsPost[] | null>(null)
  const [creating, setCreating] = useState(false)

  function refresh() {
    listEbNewsPosts(FRESH).then((res) => setPosts(res.data.ebNewsPosts))
  }

  useEffect(() => {
    refresh()
  }, [])

  return (
    <div>
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">{posts?.length ?? 0} noticias</p>
        <button
          onClick={() => setCreating((v) => !v)}
          className="rounded-lg bg-eb-teal px-3 py-1.5 text-sm font-semibold text-white"
        >
          {creating ? 'Cancelar' : '+ Nueva noticia'}
        </button>
      </div>

      {creating && (
        <NewPostForm onSaved={() => { setCreating(false); refresh() }} onCancel={() => setCreating(false)} />
      )}

      <div className="mt-4 space-y-2">
        {posts?.map((post) => (
          <div key={post.id} className="rounded-xl border border-slate-200 bg-white/90 p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-eb-blue-dark">{post.title}</p>
                <p className="text-xs text-slate-400">
                  {post.author.displayName} · {new Date(post.createdAt).toLocaleDateString('es-ES')}
                </p>
              </div>
              <button
                onClick={() => ebDeleteNewsPost(post.id).then(refresh)}
                className="text-slate-400 hover:text-red-600"
                title="Eliminar noticia"
              >
                ✕
              </button>
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">{post.body}</p>
          </div>
        ))}
        {posts?.length === 0 && <p className="text-xs text-slate-400">Ninguna noticia todavía.</p>}
      </div>
    </div>
  )
}
