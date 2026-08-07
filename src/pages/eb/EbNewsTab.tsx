import { useEffect, useState } from 'react'
import DOMPurify from 'dompurify'
import { listEbNewsPosts, type ListEbNewsPostsData } from '@dataconnect/generated'
import { RichTextEditor } from '../../components/RichTextEditor'
import { FRESH } from '../../lib/dataConnectOptions'
import { ebCreateNewsPost, ebDeleteNewsPost, ebTranslateNewsPost } from '../../lib/ebEngineering'
import { uploadEbNewsImage } from '../../lib/ebNewsStorage'
import type { EbLang } from '../../lib/ebI18n'

type NewsPost = ListEbNewsPostsData['ebNewsPosts'][number]
type NewsTranslation = { title: string; body: string }

const inputClass =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 outline-none focus:border-eb-blue'

/** Whether the editor's HTML has no visible text and no image - i.e. really empty. */
function isBodyEmpty(html: string) {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  return !doc.body.textContent?.trim() && !doc.querySelector('img')
}

function NewPostForm({ onSaved, onCancel }: { onSaved: () => void; onCancel: () => void }) {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const canSubmit = !!title.trim() && !isBodyEmpty(body)

  async function handleSubmit() {
    setSubmitting(true)
    try {
      await ebCreateNewsPost({ title: title.trim(), body })
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
      <RichTextEditor
        value={body}
        onChange={setBody}
        onImageUpload={uploadEbNewsImage}
        placeholder="Contenido de la noticia..."
      />
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
          {submitting ? 'Publicando...' : 'Publicar'}
        </button>
      </div>
    </div>
  )
}

/** `readOnly` hides the create/delete controls - used for EB Engineering
 * clients viewing news on "Mis productos" (see EbMyProductsPage), who can
 * read but not manage posts. `lang` (default "es", the language everything
 * is authored in) translates title/body via Gemini - see ebTranslateEbContent
 * in functions/index.js - reusing the cache already on each post's
 * `translations` field when present instead of re-requesting it. */
export function EbNewsTab({ readOnly = false, lang = 'es' }: { readOnly?: boolean; lang?: EbLang } = {}) {
  const [posts, setPosts] = useState<NewsPost[] | null>(null)
  const [creating, setCreating] = useState(false)
  const [translations, setTranslations] = useState<Record<string, NewsTranslation>>({})

  function refresh() {
    listEbNewsPosts(FRESH).then((res) => setPosts(res.data.ebNewsPosts))
  }

  useEffect(() => {
    refresh()
  }, [])

  useEffect(() => {
    if (lang === 'es' || !posts) return
    for (const post of posts) {
      const key = `${post.id}:${lang}`
      if (translations[key]) continue
      const cached = (post.translations as Record<string, NewsTranslation> | null | undefined)?.[lang]
      if (cached) {
        setTranslations((prev) => ({ ...prev, [key]: cached }))
        continue
      }
      // Best-effort: falls back to the original Spanish text (see the
      // render below) if translation isn't available for some reason.
      ebTranslateNewsPost(post.id, lang)
        .then((result) => setTranslations((prev) => ({ ...prev, [key]: result })))
        .catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang, posts])

  return (
    <div>
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">{posts?.length ?? 0} noticias</p>
        {!readOnly && (
          <button
            onClick={() => setCreating((v) => !v)}
            className="rounded-lg bg-eb-teal px-3 py-1.5 text-sm font-semibold text-white"
          >
            {creating ? 'Cancelar' : '+ Nueva noticia'}
          </button>
        )}
      </div>

      {creating && (
        <NewPostForm onSaved={() => { setCreating(false); refresh() }} onCancel={() => setCreating(false)} />
      )}

      <div className="mt-4 space-y-2">
        {posts?.map((post) => {
          const translation = translations[`${post.id}:${lang}`]
          return (
            <div key={post.id} className="rounded-xl border border-slate-200 bg-white/90 p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-eb-blue-dark">{translation?.title ?? post.title}</p>
                  <p className="text-xs text-slate-400">
                    {post.author.displayName} · {new Date(post.createdAt).toLocaleDateString('es-ES')}
                  </p>
                </div>
                {!readOnly && (
                  <button
                    onClick={() => ebDeleteNewsPost(post.id).then(refresh)}
                    className="text-slate-400 hover:text-red-600"
                    title="Eliminar noticia"
                  >
                    ✕
                  </button>
                )}
              </div>
              <div
                className="eb-rich-content mt-2 text-sm text-slate-600"
                dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(translation?.body ?? post.body) }}
              />
            </div>
          )
        })}
        {posts?.length === 0 && <p className="text-xs text-slate-400">Ninguna noticia todavía.</p>}
      </div>
    </div>
  )
}
