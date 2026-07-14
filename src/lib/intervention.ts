import { httpsCallable } from 'firebase/functions'
import type { OrderLocation } from '@dataconnect/generated'
import { functions } from './firebase'

export interface CreateInterventionInput {
  locationCode: OrderLocation
  customerId?: string
  newCustomer?: { name: string; contactName: string; phone: string }
  boatId?: string
  newBoat?: {
    name: string
    registrationNumber?: string
    manufacturerModel?: string
    loaMeters?: number
    beamMeters?: number
  }
  /** "YYYY-MM-DD", optional. */
  expectedDeliveryAt?: string
  homePort?: string
  pier?: string
  berthPosition?: string
  engineComponentInfo?: string
  keysLeft: boolean
  /** true = solicita presupuesto primero; false = renuncia y pasa a reparación directa. */
  wantsQuoteFirst: boolean
  requestedWork: string
  observations?: string
  /** Base64 PNG of the signature canvas, no "data:image/png;base64," prefix. */
  signaturePngBase64: string
}

interface CreateInterventionResult {
  interventionId: string
  code: string
  signatureUrl: string
}

const callCreateIntervention = httpsCallable<CreateInterventionInput, CreateInterventionResult>(
  functions,
  'createIntervention',
)

/** Creates an intervention intake record server-side (see functions/index.js). */
export async function createIntervention(input: CreateInterventionInput) {
  const res = await callCreateIntervention(input)
  return res.data
}
