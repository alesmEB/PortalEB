import { useEffect, useState } from 'react'

// EB Engineering clients (EbClient) are spread across many countries (see
// EbClientsTab) - this covers the languages of the bulk of them. Scoped to
// just the client-facing "Mis productos" page/components, not the rest of
// the app (which the naval-workshop Customer/CLIENT role uses instead).
export const EB_LANGUAGES = ['es', 'en', 'fr', 'it', 'tr', 'sv', 'bg'] as const
export type EbLang = (typeof EB_LANGUAGES)[number]

export const EB_LANGUAGE_LABEL: Record<EbLang, string> = {
  es: '🇪🇸 Español',
  en: '🇬🇧 English',
  fr: '🇫🇷 Français',
  it: '🇮🇹 Italiano',
  tr: '🇹🇷 Türkçe',
  sv: '🇸🇪 Svenska',
  bg: '🇧🇬 Български',
}

const STORAGE_KEY = 'portaleb-eb-lang'

type TranslationKey =
  | 'pageTitle'
  | 'loading'
  | 'noLinkedClient'
  | 'noProducts'
  | 'downloadProgram'
  | 'fieldPurchaseDate'
  | 'fieldHardwareVersion'
  | 'fieldSerialNumber'
  | 'fieldSoftwareVersion'
  | 'cablesTitle'
  | 'noCables'

const TRANSLATIONS: Record<EbLang, Record<TranslationKey, string>> = {
  es: {
    pageTitle: 'Mis productos',
    loading: 'Cargando...',
    noLinkedClient: 'Tu usuario no tiene ningún cliente EB Engineering vinculado.',
    noProducts: 'Todavía no tienes productos registrados.',
    downloadProgram: 'Descargar programa personalizado',
    fieldPurchaseDate: 'Fecha de compra:',
    fieldHardwareVersion: 'Versión de Hardware:',
    fieldSerialNumber: 'Número de serie:',
    fieldSoftwareVersion: 'Versión de Software:',
    cablesTitle: 'Cables asignados',
    noCables: 'Sin cables asignados.',
  },
  en: {
    pageTitle: 'My products',
    loading: 'Loading...',
    noLinkedClient: 'Your user is not linked to any EB Engineering client.',
    noProducts: "You don't have any registered products yet.",
    downloadProgram: 'Download custom program',
    fieldPurchaseDate: 'Date of Invoice:',
    fieldHardwareVersion: 'Hardware Version:',
    fieldSerialNumber: 'Serial Number:',
    fieldSoftwareVersion: 'Software Version:',
    cablesTitle: 'Assigned cables',
    noCables: 'No cables assigned.',
  },
  fr: {
    pageTitle: 'Mes produits',
    loading: 'Chargement...',
    noLinkedClient: "Votre utilisateur n'est lié à aucun client EB Engineering.",
    noProducts: "Vous n'avez encore aucun produit enregistré.",
    downloadProgram: 'Télécharger le programme personnalisé',
    fieldPurchaseDate: "Date d'achat :",
    fieldHardwareVersion: 'Version du matériel :',
    fieldSerialNumber: 'Numéro de série :',
    fieldSoftwareVersion: 'Version du logiciel :',
    cablesTitle: 'Câbles attribués',
    noCables: 'Aucun câble attribué.',
  },
  it: {
    pageTitle: 'I miei prodotti',
    loading: 'Caricamento...',
    noLinkedClient: 'Il tuo utente non è collegato a nessun cliente EB Engineering.',
    noProducts: 'Non hai ancora prodotti registrati.',
    downloadProgram: 'Scarica programma personalizzato',
    fieldPurchaseDate: 'Data di acquisto:',
    fieldHardwareVersion: 'Versione Hardware:',
    fieldSerialNumber: 'Numero di serie:',
    fieldSoftwareVersion: 'Versione Software:',
    cablesTitle: 'Cavi assegnati',
    noCables: 'Nessun cavo assegnato.',
  },
  tr: {
    pageTitle: 'Ürünlerim',
    loading: 'Yükleniyor...',
    noLinkedClient: 'Kullanıcınız herhangi bir EB Engineering müşterisine bağlı değil.',
    noProducts: 'Henüz kayıtlı bir ürününüz yok.',
    downloadProgram: 'Özel programı indir',
    fieldPurchaseDate: 'Satın Alma Tarihi:',
    fieldHardwareVersion: 'Donanım Sürümü:',
    fieldSerialNumber: 'Seri Numarası:',
    fieldSoftwareVersion: 'Yazılım Sürümü:',
    cablesTitle: 'Atanan kablolar',
    noCables: 'Atanmış kablo yok.',
  },
  sv: {
    pageTitle: 'Mina produkter',
    loading: 'Laddar...',
    noLinkedClient: 'Din användare är inte kopplad till någon EB Engineering-kund.',
    noProducts: 'Du har inga registrerade produkter än.',
    downloadProgram: 'Ladda ner anpassat program',
    fieldPurchaseDate: 'Inköpsdatum:',
    fieldHardwareVersion: 'Hårdvaruversion:',
    fieldSerialNumber: 'Serienummer:',
    fieldSoftwareVersion: 'Mjukvaruversion:',
    cablesTitle: 'Tilldelade kablar',
    noCables: 'Inga kablar tilldelade.',
  },
  bg: {
    pageTitle: 'Моите продукти',
    loading: 'Зареждане...',
    noLinkedClient: 'Вашият потребител не е свързан с клиент на EB Engineering.',
    noProducts: 'Все още нямате регистрирани продукти.',
    downloadProgram: 'Изтегляне на персонализирана програма',
    fieldPurchaseDate: 'Дата на покупка:',
    fieldHardwareVersion: 'Версия на хардуера:',
    fieldSerialNumber: 'Сериен номер:',
    fieldSoftwareVersion: 'Версия на софтуера:',
    cablesTitle: 'Присвоени кабели',
    noCables: 'Няма присвоени кабели.',
  },
}

export function ebT(lang: EbLang, key: TranslationKey): string {
  return TRANSLATIONS[lang][key]
}

function isEbLang(value: string | null): value is EbLang {
  return !!value && (EB_LANGUAGES as readonly string[]).includes(value)
}

/** Persists the chosen language in localStorage so a returning client keeps
 * their pick (same pattern as getOrCreateDeviceId in pushNotifications.ts). */
export function useEbLanguage(): [EbLang, (lang: EbLang) => void] {
  const [lang, setLangState] = useState<EbLang>(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    return isEbLang(stored) ? stored : 'es'
  })

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, lang)
  }, [lang])

  return [lang, setLangState]
}
