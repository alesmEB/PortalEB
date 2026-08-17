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

const callEbDeleteCableCheck = httpsCallable<{ cableCheckId: string }, { success: boolean }>(
  functions,
  'ebDeleteCableCheck',
)

/** Fails if the cable is currently assigned to a product. */
export async function ebDeleteCableCheck(cableCheckId: string) {
  const res = await callEbDeleteCableCheck({ cableCheckId })
  return res.data
}

interface EbClientProductInput {
  clientId: string
  serialNumber: string
  hardwareNumber: string
  softwareVersion?: string
  /** "YYYY-MM-DD", optional. */
  purchasedAt?: string
  programFileUrl?: string
  observations?: string
  /** "YYYY-MM-DD", optional - set when a distributor resells the unit to this client. */
  soldToEndUserAt?: string
  cableTypeIds?: string[]
  /** IDs of specific ESP32-tested CableCheck rows to attach to this sale (see CableCheckPicker). */
  cableCheckIds?: string[]
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

interface EbTranslateNewsInput {
  kind: 'news'
  id: string
  lang: string
}
interface EbTranslateFaqInput {
  kind: 'faq'
  id: string
  lang: string
}

const callEbTranslateEbNewsContent = httpsCallable<EbTranslateNewsInput, { title: string; body: string }>(
  functions,
  'ebTranslateEbContent',
)
const callEbTranslateEbFaqContent = httpsCallable<
  EbTranslateFaqInput,
  { question: string; answer: string }
>(functions, 'ebTranslateEbContent')

/** Translates a news post's title/body into `lang` via Gemini - cached
 * server-side after the first call for that language (see
 * ebTranslateEbContent in functions/index.js), so this is cheap to call
 * again for the same post/language. */
export async function ebTranslateNewsPost(id: string, lang: string) {
  const res = await callEbTranslateEbNewsContent({ kind: 'news', id, lang })
  return res.data
}

/** Same as ebTranslateNewsPost but for a FAQ item's question/answer. */
export async function ebTranslateFaqItem(id: string, lang: string) {
  const res = await callEbTranslateEbFaqContent({ kind: 'faq', id, lang })
  return res.data
}
