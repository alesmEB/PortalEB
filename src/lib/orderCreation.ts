import { httpsCallable } from 'firebase/functions'
import type { OrderLocation } from '@dataconnect/generated'
import { functions } from './firebase'

interface EngineInput {
  engineType: string
  chassisNumber: string
  propellerSerialNumber: string
}

export interface CreateWorkOrderInput {
  locationCode: OrderLocation
  customerId?: string
  newCustomer?: { name: string; contactName: string; phone: string }
  customerLinkedUserId?: string
  boatId?: string
  newBoat?: { name: string; registrationNumber?: string }
  newEngines?: EngineInput[]
  assetLocation: string
  description?: string
  tasks: string[]
  /** Skips straight to AWAITING_ASSIGNMENT - requires admin:lab. */
  skipQuote?: boolean
  /** Omit to skip report generation entirely (used by the lab quick-create shortcut). */
  pdfData?: {
    customerName: string
    contactName: string
    phone: string
    boatName: string
    registrationNumber?: string
    engines: EngineInput[]
    locationLabel: string
  }
}

interface CreateWorkOrderResult {
  workOrderId: string
  code: string
  customerId: string
  boatId: string
  finalReportUrl: string | null
}

const callCreateWorkOrder = httpsCallable<CreateWorkOrderInput, CreateWorkOrderResult>(
  functions,
  'createWorkOrder',
)

/** Creates a work order server-side - see functions/index.js for why (avoids the order-code race). */
export async function createWorkOrder(input: CreateWorkOrderInput) {
  const res = await callCreateWorkOrder(input)
  return res.data
}
