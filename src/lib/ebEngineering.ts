import { httpsCallable } from 'firebase/functions'
import { functions } from './firebase'

// "EB Engineering" intranet section - clients/products directory, news and
// FAQ. Every management write requires ADMIN role or admin:lab (see
// requireAdminOrLab in functions/index.js).

interface EbClientInput {
  email: string
  companyName: string
  contactName: string
  phone: string
  country: string
  distributorId?: string
  linkedUserId?: string
}

const callEbCreateClient = httpsCallable<EbClientInput, { success: boolean }>(
  functions,
  'ebCreateClient',
)

export async function ebCreateClient(input: EbClientInput) {
  const res = await callEbCreateClient(input)
  return res.data
}

interface EbUpdateClientInput extends EbClientInput {
  clientId: string
}

const callEbUpdateClient = httpsCallable<EbUpdateClientInput, { success: boolean }>(
  functions,
  'ebUpdateClient',
)

export async function ebUpdateClient(input: EbUpdateClientInput) {
  const res = await callEbUpdateClient(input)
  return res.data
}

const callEbDeleteClient = httpsCallable<{ clientId: string }, { success: boolean }>(
  functions,
  'ebDeleteClient',
)

export async function ebDeleteClient(clientId: string) {
  const res = await callEbDeleteClient({ clientId })
  return res.data
}

const callEbCreateCableType = httpsCallable<{ code: string; name: string }, { success: boolean }>(
  functions,
  'ebCreateCableType',
)

export async function ebCreateCableType(code: string, name: string) {
  const res = await callEbCreateCableType({ code, name })
  return res.data
}

interface EbClientProductInput {
  clientId: string
  serialNumber: string
  hardwareNumber: string
  /** "YYYY-MM-DD", optional. */
  purchasedAt?: string
  programFileUrl?: string
  observations?: string
  cableTypeIds?: string[]
}

const callEbAddClientProduct = httpsCallable<EbClientProductInput, { productId: string }>(
  functions,
  'ebAddClientProduct',
)

export async function ebAddClientProduct(input: EbClientProductInput) {
  const res = await callEbAddClientProduct(input)
  return res.data
}

interface EbUpdateClientProductInput extends EbClientProductInput {
  productId: string
}

const callEbUpdateClientProduct = httpsCallable<EbUpdateClientProductInput, { success: boolean }>(
  functions,
  'ebUpdateClientProduct',
)

/** clientId can be changed here - e.g. reassigning a unit a distributor resold to their own end client. */
export async function ebUpdateClientProduct(input: EbUpdateClientProductInput) {
  const res = await callEbUpdateClientProduct(input)
  return res.data
}

const callEbDeleteClientProduct = httpsCallable<{ productId: string }, { success: boolean }>(
  functions,
  'ebDeleteClientProduct',
)

export async function ebDeleteClientProduct(productId: string) {
  const res = await callEbDeleteClientProduct({ productId })
  return res.data
}

const callEbSetClientProductRetired = httpsCallable<
  { productId: string; retired: boolean },
  { success: boolean }
>(functions, 'ebSetClientProductRetired')

/** Marks a unit decommissioned (e.g. broken) or reactivates it - kept in the DB either way. */
export async function ebSetClientProductRetired(productId: string, retired: boolean) {
  const res = await callEbSetClientProductRetired({ productId, retired })
  return res.data
}

interface EbNewsPostInput {
  title: string
  body: string
}

const callEbCreateNewsPost = httpsCallable<EbNewsPostInput, { success: boolean }>(
  functions,
  'ebCreateNewsPost',
)

export async function ebCreateNewsPost(input: EbNewsPostInput) {
  const res = await callEbCreateNewsPost(input)
  return res.data
}

const callEbDeleteNewsPost = httpsCallable<{ postId: string }, { success: boolean }>(
  functions,
  'ebDeleteNewsPost',
)

export async function ebDeleteNewsPost(postId: string) {
  const res = await callEbDeleteNewsPost({ postId })
  return res.data
}

interface EbFaqItemInput {
  question: string
  answer: string
}

const callEbCreateFaqItem = httpsCallable<EbFaqItemInput, { success: boolean }>(
  functions,
  'ebCreateFaqItem',
)

export async function ebCreateFaqItem(input: EbFaqItemInput) {
  const res = await callEbCreateFaqItem(input)
  return res.data
}

const callEbDeleteFaqItem = httpsCallable<{ faqId: string }, { success: boolean }>(
  functions,
  'ebDeleteFaqItem',
)

export async function ebDeleteFaqItem(faqId: string) {
  const res = await callEbDeleteFaqItem({ faqId })
  return res.data
}
