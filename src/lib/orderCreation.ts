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
  /** The calendar appointment this order comes from - on save the server
   * completes it and links it, which turns its calendar chip purple. */
  appointmentId?: string
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

/** What the calendar hands the new-order form when an appointment is completed
 * as "crea orden" - it only prefills the form; the order is still created by
 * hand, and the appointment only completes once it is. */
export interface OrderFromAppointment {
  id: string
  title: string
  boatDetails?: string | null
  locationCode: OrderLocation
  notes?: string | null
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
