import { httpsCallable } from 'firebase/functions'
import type { UserRole } from '@dataconnect/generated'
import { functions } from './firebase'

interface EngineInput {
  engineType: string
  chassisNumber: string
  propellerSerialNumber: string
}

// --- Users & permissions ----------------------------------------------------

interface AdminCreateUserInput {
  email: string
  password: string
  displayName: string
  role: UserRole
  permissionIds: string[]
}

const callAdminCreateUser = httpsCallable<AdminCreateUserInput, { uid: string }>(
  functions,
  'adminCreateUser',
)

/** Creates the Auth account + profile + permission grants in one call - requires admin:manage. */
export async function adminCreateUser(input: AdminCreateUserInput) {
  const res = await callAdminCreateUser(input)
  return res.data
}

interface AdminUpdateUserInput {
  userId: string
  displayName: string
  role: UserRole
  isActive: boolean
  permissionIds: string[]
}

const callAdminUpdateUser = httpsCallable<AdminUpdateUserInput, { success: boolean }>(
  functions,
  'adminUpdateUser',
)

/** Updates profile + diffs permission grants - requires admin:manage. */
export async function adminUpdateUser(input: AdminUpdateUserInput) {
  const res = await callAdminUpdateUser(input)
  return res.data
}

const callAdminCreatePermission = httpsCallable<
  { key: string; description: string },
  { success: boolean }
>(functions, 'adminCreatePermission')

/** Requires admin:manage. */
export async function adminCreatePermission(key: string, description: string) {
  const res = await callAdminCreatePermission({ key, description })
  return res.data
}

// --- Customers ---------------------------------------------------------------

interface AdminCreateCustomerInput {
  name: string
  contactName: string
  phone: string
  email?: string
}

const callAdminCreateCustomer = httpsCallable<AdminCreateCustomerInput, { success: boolean }>(
  functions,
  'adminCreateCustomer',
)

/** Requires admin:manage. */
export async function adminCreateCustomer(input: AdminCreateCustomerInput) {
  const res = await callAdminCreateCustomer(input)
  return res.data
}

interface AdminUpdateCustomerInput {
  customerId: string
  name: string
  contactName: string
  phone: string
  email?: string
  linkedUserId?: string | null
}

const callAdminUpdateCustomer = httpsCallable<AdminUpdateCustomerInput, { success: boolean }>(
  functions,
  'adminUpdateCustomer',
)

/** Requires admin:manage. */
export async function adminUpdateCustomer(input: AdminUpdateCustomerInput) {
  const res = await callAdminUpdateCustomer(input)
  return res.data
}

// --- Boats & engines -----------------------------------------------------

interface AdminCreateBoatInput {
  ownerId: string
  name: string
  registrationNumber?: string
  engines?: EngineInput[]
}

const callAdminCreateBoat = httpsCallable<AdminCreateBoatInput, { boatId: string }>(
  functions,
  'adminCreateBoat',
)

/** Optionally seeds initial engines in the same call - requires admin:manage. */
export async function adminCreateBoat(input: AdminCreateBoatInput) {
  const res = await callAdminCreateBoat(input)
  return res.data
}

interface AdminUpdateBoatInput {
  boatId: string
  ownerId: string
  name: string
  registrationNumber?: string
}

const callAdminUpdateBoat = httpsCallable<AdminUpdateBoatInput, { success: boolean }>(
  functions,
  'adminUpdateBoat',
)

/** Requires admin:manage. */
export async function adminUpdateBoat(input: AdminUpdateBoatInput) {
  const res = await callAdminUpdateBoat(input)
  return res.data
}

interface AdminCreateEngineInput extends EngineInput {
  boatId: string
}

const callAdminCreateEngine = httpsCallable<AdminCreateEngineInput, { success: boolean }>(
  functions,
  'adminCreateEngine',
)

/** Requires admin:manage. */
export async function adminCreateEngine(input: AdminCreateEngineInput) {
  const res = await callAdminCreateEngine(input)
  return res.data
}

interface AdminUpdateEngineInput extends EngineInput {
  engineId: string
}

const callAdminUpdateEngine = httpsCallable<AdminUpdateEngineInput, { success: boolean }>(
  functions,
  'adminUpdateEngine',
)

/** Requires admin:manage. */
export async function adminUpdateEngine(input: AdminUpdateEngineInput) {
  const res = await callAdminUpdateEngine(input)
  return res.data
}

const callAdminDeleteEngine = httpsCallable<{ engineId: string }, { success: boolean }>(
  functions,
  'adminDeleteEngine',
)

/** Requires admin:manage. */
export async function adminDeleteEngine(engineId: string) {
  const res = await callAdminDeleteEngine({ engineId })
  return res.data
}
