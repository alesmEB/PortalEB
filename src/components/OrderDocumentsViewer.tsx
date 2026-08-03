import { useState } from 'react'
import { PdfViewer } from './PdfViewer'

export interface DocumentOption {
  label: string
  url: string
}

/**
 * Single picker + viewer for every PDF a work order has (the generated
 * report, each quote attempt...) instead of rendering one PdfViewer per
 * document stacked inline - keeps the page from turning into a wall of PDFs
 * once there are a couple of quote attempts alongside the report.
 */
export function OrderDocumentsViewer({ documents }: { documents: DocumentOption[] }) {
  const [selected, setSelected] = useState(0)

  if (documents.length === 0) {
    return <p className="mt-2 text-sm text-slate-500">Todavía no hay ningún documento.</p>
  }

  const current = documents[Math.min(selected, documents.length - 1)]

  return (
    <div>
      <div className="mt-2 flex flex-wrap gap-2">
        {documents.map((doc, i) => (
          <button
            key={doc.url}
            onClick={() => setSelected(i)}
            className={`rounded-full border px-3 py-1 text-xs ${
              i === selected ? 'border-eb-blue bg-eb-blue text-white' : 'border-slate-300 text-slate-600'
            }`}
          >
            {doc.label}
          </button>
        ))}
      </div>
      <div className="mt-3">
        <PdfViewer url={current.url} />
      </div>
    </div>
  )
}
