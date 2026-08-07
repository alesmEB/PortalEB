import { useEffect, useState } from 'react'
import { listEbFaqItems, type ListEbFaqItemsData } from '@dataconnect/generated'
import { FRESH } from '../../lib/dataConnectOptions'
import { ebCreateFaqItem, ebDeleteFaqItem, ebTranslateFaqItem } from '../../lib/ebEngineering'
import type { EbLang } from '../../lib/ebI18n'

type FaqItem = ListEbFaqItemsData['ebFaqItems'][number]
type FaqTranslation = { question: string; answer: string }

const inputClass =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 outline-none focus:border-eb-blue'

function NewFaqForm({ onSaved, onCancel }: { onSaved: () => void; onCancel: () => void }) {
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit() {
    setSubmitting(true)
    try {
      await ebCreateFaqItem({ question: question.trim(), answer: answer.trim() })
      onSaved()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mt-3 space-y-3 border-t border-slate-200 pt-3 first:mt-0 first:border-t-0 first:pt-0">
      <input
        placeholder="Pregunta"
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        className={inputClass}
      />
      <textarea
        placeholder="Respuesta"
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        rows={3}
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
          disabled={!question.trim() || !answer.trim() || submitting}
          onClick={handleSubmit}
          className="flex-1 rounded-lg bg-eb-blue py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {submitting ? 'Guardando...' : 'Añadir'}
        </button>
      </div>
    </div>
  )
}

/** `readOnly` hides the create/delete controls - used for EB Engineering
 * clients viewing FAQs on "Mis productos" (see EbMyProductsPage), who can
 * read but not manage entries. `lang` (default "es", the language everything
 * is authored in) translates question/answer via Gemini - see
 * ebTranslateEbContent in functions/index.js - reusing the cache already on
 * each item's `translations` field when present instead of re-requesting it. */
export function EbFaqTab({ readOnly = false, lang = 'es' }: { readOnly?: boolean; lang?: EbLang } = {}) {
  const [items, setItems] = useState<FaqItem[] | null>(null)
  const [creating, setCreating] = useState(false)
  const [translations, setTranslations] = useState<Record<string, FaqTranslation>>({})

  function refresh() {
    listEbFaqItems(FRESH).then((res) => setItems(res.data.ebFaqItems))
  }

  useEffect(() => {
    refresh()
  }, [])

  useEffect(() => {
    if (lang === 'es' || !items) return
    for (const item of items) {
      const key = `${item.id}:${lang}`
      if (translations[key]) continue
      const cached = (item.translations as Record<string, FaqTranslation> | null | undefined)?.[lang]
      if (cached) {
        setTranslations((prev) => ({ ...prev, [key]: cached }))
        continue
      }
      // Best-effort: falls back to the original Spanish text (see the
      // render below) if translation isn't available for some reason.
      ebTranslateFaqItem(item.id, lang)
        .then((result) => setTranslations((prev) => ({ ...prev, [key]: result })))
        .catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang, items])

  return (
    <div>
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">{items?.length ?? 0} preguntas</p>
        {!readOnly && (
          <button
            onClick={() => setCreating((v) => !v)}
            className="rounded-lg bg-eb-teal px-3 py-1.5 text-sm font-semibold text-white"
          >
            {creating ? 'Cancelar' : '+ Nueva pregunta'}
          </button>
        )}
      </div>

      {creating && (
        <NewFaqForm onSaved={() => { setCreating(false); refresh() }} onCancel={() => setCreating(false)} />
      )}

      <div className="mt-4 space-y-2">
        {items?.map((item) => {
          const translation = translations[`${item.id}:${lang}`]
          return (
            <div key={item.id} className="rounded-xl border border-slate-200 bg-white/90 p-4">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold text-eb-blue-dark">
                  {translation?.question ?? item.question}
                </p>
                {!readOnly && (
                  <button
                    onClick={() => ebDeleteFaqItem(item.id).then(refresh)}
                    className="text-slate-400 hover:text-red-600"
                    title="Eliminar pregunta"
                  >
                    ✕
                  </button>
                )}
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">
                {translation?.answer ?? item.answer}
              </p>
            </div>
          )
        })}
        {items?.length === 0 && <p className="text-xs text-slate-400">Ninguna pregunta todavía.</p>}
      </div>
    </div>
  )
}
