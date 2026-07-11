import { httpsCallable } from 'firebase/functions'
import { functions } from './firebase'

// "EB Engineering" intranet section - clients/products directory, news and
// FAQ. Every write requires admin:lab for now (see functions/index.js).

interface EbClientInput {
  name: string
  contactName?: string
  phone?: string
  email?: string
  notes?: string
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

interface EbAddClientProductInput {
  clientId: string
  productName: string
  /** "YYYY-MM-DD", optional. */
  purchasedAt?: string
  notes?: string
}

const callEbAddClientProduct = httpsCallable<EbAddClientProductInput, { success: boolean }>(
  functions,
  'ebAddClientProduct',
)

export async function ebAddClientProduct(input: EbAddClientProductInput) {
  const res = await callEbAddClientProduct(input)
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
