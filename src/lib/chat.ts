import {
  addDoc,
  collection,
  doc,
  documentId,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore'
import { MediaType } from '@dataconnect/generated'
import { firestore } from './firebase'

export type ChatKind = 'client' | 'technicians'

const COLLECTION_BY_KIND: Record<ChatKind, string> = {
  client: 'clientChats',
  technicians: 'technicianChats',
}

export interface ChatMessage {
  id: string
  senderId: string
  senderName: string
  text: string
  mediaUrl?: string
  mediaType?: MediaType
  createdAt: Timestamp | null
}

export interface ChatDoc {
  participants: string[]
  lastMessageAt: Timestamp | null
  lastRead: Record<string, Timestamp>
}

function chatDocRef(kind: ChatKind, orderId: string) {
  return doc(firestore, COLLECTION_BY_KIND[kind], orderId)
}

/** Creates the chat doc if missing (order creation time) - a no-op via merge otherwise. */
export async function ensureChatDoc(kind: ChatKind, orderId: string, participants: string[]) {
  await setDoc(
    chatDocRef(kind, orderId),
    { participants, lastMessageAt: null, lastRead: {} },
    { merge: true },
  )
}

/** Overwrites the participant roster, e.g. after technicians are assigned/unassigned. */
export async function setChatParticipants(kind: ChatKind, orderId: string, participants: string[]) {
  await setDoc(chatDocRef(kind, orderId), { participants }, { merge: true })
}

export function subscribeToChatDoc(
  kind: ChatKind,
  orderId: string,
  callback: (chat: ChatDoc | null) => void,
): Unsubscribe {
  return onSnapshot(chatDocRef(kind, orderId), (snap) => {
    callback(snap.exists() ? (snap.data() as ChatDoc) : null)
  })
}

export function subscribeToMessages(
  kind: ChatKind,
  orderId: string,
  callback: (messages: ChatMessage[]) => void,
): Unsubscribe {
  const messagesRef = collection(chatDocRef(kind, orderId), 'messages')
  return onSnapshot(query(messagesRef, orderBy('createdAt', 'asc')), (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ChatMessage, 'id'>) })))
  })
}

export async function sendChatMessage(
  kind: ChatKind,
  orderId: string,
  senderId: string,
  senderName: string,
  text: string,
  media?: { url: string; type: MediaType },
) {
  const messagesRef = collection(chatDocRef(kind, orderId), 'messages')
  await addDoc(messagesRef, {
    senderId,
    senderName,
    text,
    ...(media ? { mediaUrl: media.url, mediaType: media.type } : {}),
    createdAt: serverTimestamp(),
  })
  // setDoc+merge rather than updateDoc: orders created before this feature
  // shipped may not have a chat doc yet (see ensureChatDoc at order creation).
  await setDoc(
    chatDocRef(kind, orderId),
    { lastMessageAt: serverTimestamp(), lastRead: { [senderId]: serverTimestamp() } },
    { merge: true },
  )
}

export async function markChatRead(kind: ChatKind, orderId: string, uid: string) {
  await updateDoc(chatDocRef(kind, orderId), { [`lastRead.${uid}`]: serverTimestamp() })
}

export function hasUnread(chat: ChatDoc | null | undefined, uid: string): boolean {
  if (!chat?.lastMessageAt) return false
  const lastRead = chat.lastRead?.[uid]
  return !lastRead || chat.lastMessageAt.toMillis() > lastRead.toMillis()
}

/**
 * Subscribes to every chat doc for the given order ids (chunked into groups
 * of 10, Firestore's `in` filter limit) and reports which ones have unread
 * messages for `uid`. Meant for list screens (orders list, assignments).
 */
export function subscribeToUnreadOrderIds(
  kind: ChatKind,
  orderIds: string[],
  uid: string,
  callback: (unreadOrderIds: Set<string>) => void,
): Unsubscribe {
  if (orderIds.length === 0) {
    callback(new Set())
    return () => {}
  }

  const chunks: string[][] = []
  for (let i = 0; i < orderIds.length; i += 10) chunks.push(orderIds.slice(i, i + 10))

  const unreadByChunk = new Map<number, Set<string>>()
  function emit() {
    const merged = new Set<string>()
    for (const set of unreadByChunk.values()) for (const id of set) merged.add(id)
    callback(merged)
  }

  const unsubscribes = chunks.map((chunkIds, chunkIndex) =>
    onSnapshot(
      query(collection(firestore, COLLECTION_BY_KIND[kind]), where(documentId(), 'in', chunkIds)),
      (snap) => {
        const unread = new Set<string>()
        snap.forEach((d) => {
          if (hasUnread(d.data() as ChatDoc, uid)) unread.add(d.id)
        })
        unreadByChunk.set(chunkIndex, unread)
        emit()
      },
      // A chunk fails entirely (permission-denied) if `uid` isn't a listed
      // participant on every chat doc it contains - e.g. an order created
      // before the customer's portal account was linked. Degrade to "no
      // unread" for that chunk rather than leaving a dangling error.
      () => {
        unreadByChunk.set(chunkIndex, new Set())
        emit()
      },
    ),
  )

  return () => unsubscribes.forEach((unsub) => unsub())
}
