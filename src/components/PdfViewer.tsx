import { useEffect, useState } from 'react'

/**
 * Renders a PDF to <canvas> via pdf.js instead of relying on the browser's
 * native PDF plugin - mobile browsers (iOS Safari, most Android browsers)
 * don't render PDFs inline in an <iframe>, they just offer a download, so a
 * JS-side renderer is the only way to get an in-app preview on mobile.
 * Loaded lazily since pdfjs-dist is a sizeable dependency.
 */
export function PdfViewer({ url }: { url: string }) {
  const [reactPdf, setReactPdf] = useState<typeof import('react-pdf') | null>(null)
  const [numPages, setNumPages] = useState(0)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    Promise.all([import('react-pdf'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')])
      .then(([mod, worker]) => {
        if (cancelled) return
        mod.pdfjs.GlobalWorkerOptions.workerSrc = worker.default
        setReactPdf(mod)
      })
      .catch(() => setError(true))
    return () => {
      cancelled = true
    }
  }, [])

  if (error) return <p className="text-sm text-red-600">No se pudo cargar el visor de PDF.</p>
  if (!reactPdf) return <p className="text-sm text-slate-500">Cargando visor...</p>

  const { Document, Page } = reactPdf
  const pageWidth = Math.min(window.innerWidth - 48, 700)

  return (
    <Document
      file={url}
      loading={<p className="text-sm text-slate-500">Cargando PDF...</p>}
      error={<p className="text-sm text-red-600">No se pudo cargar el PDF.</p>}
      onLoadSuccess={({ numPages }) => setNumPages(numPages)}
    >
      <div className="flex flex-col items-center gap-3">
        {Array.from({ length: numPages }, (_, i) => (
          <Page
            key={i}
            pageNumber={i + 1}
            width={pageWidth}
            renderTextLayer={false}
            renderAnnotationLayer={false}
            className="overflow-hidden rounded-lg border border-slate-200"
          />
        ))}
      </div>
    </Document>
  )
}
