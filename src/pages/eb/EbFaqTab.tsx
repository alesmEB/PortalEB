import { useEffect, useState } from 'react'
import { listEbFaqItems, type ListEbFaqItemsData } from '@dataconnect/generated'
import { FRESH } from '../../lib/dataConnectOptions'
import { ebCreateFaqItem, ebDeleteFaqItem } from '../../lib/ebEngineering'

type FaqItem = ListEbFaqItemsData['ebFaqItems'][number]

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

export function EbFaqTab() {
  const [items, setItems] = useState<FaqItem[] | null>(null)
  const [creating, setCreating] = useState(false)

  function refresh() {
    listEbFaqItems(FRESH).then((res) => setItems(res.data.ebFaqItems))
  }

  useEffect(() => {
    refresh()
  }, [])

  return (
    <div>
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">{items?.length ?? 0} preguntas</p>
        <button
          onClick={() => setCreating((v) => !v)}
          className="rounded-lg bg-eb-teal px-3 py-1.5 text-sm font-semibold text-white"
        >
          {creating ? 'Cancelar' : '+ Nueva pregunta'}
        </button>
      </div>

      {creating && (
        <NewFaqForm onSaved={() => { setCreating(false); refresh() }} onCancel={() => setCreating(false)} />
      )}

      <div className="mt-4 space-y-2">
        {items?.map((item) => (
          <div key={item.id} className="rounded-xl border border-slate-200 bg-white/90 p-4">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-semibold text-eb-blue-dark">{item.question}</p>
              <button
                onClick={() => ebDeleteFaqItem(item.id).then(refresh)}
                className="text-slate-400 hover:text-red-600"
                title="Eliminar pregunta"
              >
                ✕
              </button>
            </div>
            <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{item.answer}</p>
          </div>
        ))}
        {items?.length === 0 && <p className="text-xs text-slate-400">Ninguna pregunta todavía.</p>}
      </div>
    </div>
  )
}
