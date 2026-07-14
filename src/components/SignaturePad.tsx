import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'

export interface SignaturePadHandle {
  isEmpty(): boolean
  /** Base64 PNG, no "data:image/png;base64," prefix. */
  toBase64Png(): string
  clear(): void
}

interface SignaturePadProps {
  /** Fires whenever the canvas transitions between blank and drawn-on, so a parent form can gate submit on it. */
  onEmptyChange?: (isEmpty: boolean) => void
}

/** A finger/mouse-drawable signature canvas - see createIntervention's consent capture. */
export const SignaturePad = forwardRef<SignaturePadHandle, SignaturePadProps>(function SignaturePad(
  { onEmptyChange },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawingRef = useRef(false)
  const hasDrawnRef = useRef(false)
  const lastPointRef = useRef<{ x: number; y: number } | null>(null)
  const [isEmpty, setIsEmpty] = useState(true)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    // Backs the canvas with real device pixels so strokes stay crisp on
    // high-DPI phone screens, while CSS keeps it laid out at its displayed size.
    const ratio = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * ratio
    canvas.height = rect.height * ratio
    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.scale(ratio, ratio)
      ctx.lineWidth = 2
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.strokeStyle = '#1e293b'
    }
  }, [])

  function pointFromEvent(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = canvasRef.current!.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    canvasRef.current?.setPointerCapture(e.pointerId)
    drawingRef.current = true
    lastPointRef.current = pointFromEvent(e)
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return
    const ctx = canvasRef.current?.getContext('2d')
    const point = pointFromEvent(e)
    if (ctx && lastPointRef.current) {
      ctx.beginPath()
      ctx.moveTo(lastPointRef.current.x, lastPointRef.current.y)
      ctx.lineTo(point.x, point.y)
      ctx.stroke()
    }
    lastPointRef.current = point
    if (!hasDrawnRef.current) {
      hasDrawnRef.current = true
      setIsEmpty(false)
      onEmptyChange?.(false)
    }
  }

  function handlePointerUp() {
    drawingRef.current = false
    lastPointRef.current = null
  }

  function clearSignature() {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height)
    hasDrawnRef.current = false
    setIsEmpty(true)
    onEmptyChange?.(true)
  }

  useImperativeHandle(ref, () => ({
    isEmpty: () => !hasDrawnRef.current,
    toBase64Png: () => canvasRef.current!.toDataURL('image/png').split(',')[1],
    clear: clearSignature,
  }))

  return (
    <div>
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        className="h-40 w-full touch-none rounded-lg border border-slate-300 bg-white"
      />
      <div className="mt-1 flex items-center justify-between">
        <p className="text-xs text-slate-400">Firma aquí con el dedo o el ratón.</p>
        {!isEmpty && (
          <button type="button" onClick={clearSignature} className="text-xs text-eb-blue underline">
            Borrar firma
          </button>
        )}
      </div>
    </div>
  )
})
