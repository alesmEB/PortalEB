import { httpsCallable } from 'firebase/functions'
import { functions } from './firebase'

/** One submission from the workshop tablets (see listServiceRatings in functions/index.js). */
export interface ServiceRating {
  id: string
  /** 1-5; 0 on a handful of early rows saved before the app required a score. */
  rating: number
  comments: string
  /** Location enum index from the rating app: 1 = Menacha (Algeciras), 2 = Varadero (La Línea). */
  location: number
  /** 1 = Servicio de venta, 2 = Servicio técnico; 0 = not recorded. */
  serviceType: number
  /** ISO timestamp. */
  date: string
}

export const RATING_LOCATION_LABEL: Record<number, string> = {
  1: 'Menacha (Algeciras)',
  2: 'Varadero (La Línea)',
}

export const RATING_SERVICE_TYPE_LABEL: Record<number, string> = {
  1: 'Servicio de venta',
  2: 'Servicio técnico',
}

const callListServiceRatings = httpsCallable<undefined, { ratings: ServiceRating[] }>(
  functions,
  'listServiceRatings',
)

/** Requires the "ratings:view" permission. */
export async function listServiceRatings() {
  const res = await callListServiceRatings()
  return res.data.ratings
}

const callExportRatingsPdf = httpsCallable<
  { from: string | null; to: string | null },
  { pdfBase64: string; count: number }
>(functions, 'exportRatingsPdf')

/**
 * Builds the period report server-side and hands back a Blob to save.
 * Dates are "YYYY-MM-DD"; either end can be null for an open range.
 */
export async function exportRatingsPdf(from: string | null, to: string | null) {
  const res = await callExportRatingsPdf({ from, to })
  const bytes = Uint8Array.from(atob(res.data.pdfBase64), (c) => c.charCodeAt(0))
  return { blob: new Blob([bytes], { type: 'application/pdf' }), count: res.data.count }
}
