import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

// EB Engineering clients (EbClient) are spread across many countries (see
// EbClientsTab) - this covers the languages of the bulk of them. Scoped to
// just the client-facing "Mis productos" page (and the surrounding app
// chrome - UserBar/Footer - while ON that page only, see EbLanguageProvider
// below), not the rest of the app (which the naval-workshop Customer/CLIENT
// role uses instead, always in Spanish).
// No separate "Austrian" entry: Austria's official language is German, so
// the "de" option below covers it - there's no distinct Austrian language.
export const EB_LANGUAGES = [
  'es', 'en', 'fr', 'it', 'tr', 'sv', 'bg', 'hr', 'el', 'nl', 'no', 'de', 'sr', 'pt', 'ja',
] as const
export type EbLang = (typeof EB_LANGUAGES)[number]

export const EB_LANGUAGE_LABEL: Record<EbLang, string> = {
  es: '🇪🇸 Español',
  en: '🇬🇧 English',
  fr: '🇫🇷 Français',
  it: '🇮🇹 Italiano',
  tr: '🇹🇷 Türkçe',
  sv: '🇸🇪 Svenska',
  bg: '🇧🇬 Български',
  hr: '🇭🇷 Hrvatski',
  el: '🇬🇷 Ελληνικά',
  nl: '🇳🇱 Nederlands',
  no: '🇳🇴 Norsk',
  de: '🇩🇪 Deutsch',
  sr: '🇷🇸 Srpski',
  pt: '🇵🇹 Português',
  ja: '🇯🇵 日本語',
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
  | 'allRightsReserved'
  | 'roleClient'
  | 'tabProducts'
  | 'tabNews'
  | 'tabFaq'
  | 'signOut'

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
    allRightsReserved: 'Todos los derechos reservados.',
    roleClient: 'Cliente',
    tabProducts: 'Productos',
    tabNews: 'Noticias',
    tabFaq: 'FAQ',
    signOut: 'Cerrar sesión',
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
    allRightsReserved: 'All rights reserved.',
    roleClient: 'Client',
    tabProducts: 'Products',
    tabNews: 'News',
    tabFaq: 'FAQ',
    signOut: 'Sign out',
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
    allRightsReserved: 'Tous droits réservés.',
    roleClient: 'Client',
    tabProducts: 'Produits',
    tabNews: 'Actualités',
    tabFaq: 'FAQ',
    signOut: 'Déconnexion',
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
    allRightsReserved: 'Tutti i diritti riservati.',
    roleClient: 'Cliente',
    tabProducts: 'Prodotti',
    tabNews: 'Notizie',
    tabFaq: 'FAQ',
    signOut: 'Disconnetti',
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
    allRightsReserved: 'Tüm hakları saklıdır.',
    roleClient: 'Müşteri',
    tabProducts: 'Ürünler',
    tabNews: 'Haberler',
    tabFaq: 'FAQ',
    signOut: 'Çıkış yap',
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
    allRightsReserved: 'Alla rättigheter förbehållna.',
    roleClient: 'Kund',
    tabProducts: 'Produkter',
    tabNews: 'Nyheter',
    tabFaq: 'FAQ',
    signOut: 'Logga ut',
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
    allRightsReserved: 'Всички права запазени.',
    roleClient: 'Клиент',
    tabProducts: 'Продукти',
    tabNews: 'Новини',
    tabFaq: 'FAQ',
    signOut: 'Изход',
  },
  hr: {
    pageTitle: 'Moji proizvodi',
    loading: 'Učitavanje...',
    noLinkedClient: 'Vaš korisnik nije povezan ni s jednim EB Engineering klijentom.',
    noProducts: 'Još nemate registriranih proizvoda.',
    downloadProgram: 'Preuzmi prilagođeni program',
    fieldPurchaseDate: 'Datum kupnje:',
    fieldHardwareVersion: 'Verzija hardvera:',
    fieldSerialNumber: 'Serijski broj:',
    fieldSoftwareVersion: 'Verzija softvera:',
    cablesTitle: 'Dodijeljeni kabeli',
    noCables: 'Nema dodijeljenih kabela.',
    allRightsReserved: 'Sva prava pridržana.',
    roleClient: 'Klijent',
    tabProducts: 'Proizvodi',
    tabNews: 'Novosti',
    tabFaq: 'FAQ',
    signOut: 'Odjava',
  },
  el: {
    pageTitle: 'Τα προϊόντα μου',
    loading: 'Φόρτωση...',
    noLinkedClient: 'Ο χρήστης σας δεν είναι συνδεδεμένος με κανέναν πελάτη της EB Engineering.',
    noProducts: 'Δεν έχετε ακόμη καταχωρημένα προϊόντα.',
    downloadProgram: 'Λήψη προσαρμοσμένου προγράμματος',
    fieldPurchaseDate: 'Ημερομηνία αγοράς:',
    fieldHardwareVersion: 'Έκδοση Υλικού:',
    fieldSerialNumber: 'Σειριακός Αριθμός:',
    fieldSoftwareVersion: 'Έκδοση Λογισμικού:',
    cablesTitle: 'Ανατεθειμένα καλώδια',
    noCables: 'Δεν έχουν ανατεθεί καλώδια.',
    allRightsReserved: 'Με την επιφύλαξη παντός δικαιώματος.',
    roleClient: 'Πελάτης',
    tabProducts: 'Προϊόντα',
    tabNews: 'Νέα',
    tabFaq: 'FAQ',
    signOut: 'Αποσύνδεση',
  },
  nl: {
    pageTitle: 'Mijn producten',
    loading: 'Laden...',
    noLinkedClient: 'Uw gebruiker is niet gekoppeld aan een EB Engineering-klant.',
    noProducts: 'U heeft nog geen geregistreerde producten.',
    downloadProgram: 'Aangepast programma downloaden',
    fieldPurchaseDate: 'Aankoopdatum:',
    fieldHardwareVersion: 'Hardwareversie:',
    fieldSerialNumber: 'Serienummer:',
    fieldSoftwareVersion: 'Softwareversie:',
    cablesTitle: 'Toegewezen kabels',
    noCables: 'Geen kabels toegewezen.',
    allRightsReserved: 'Alle rechten voorbehouden.',
    roleClient: 'Klant',
    tabProducts: 'Producten',
    tabNews: 'Nieuws',
    tabFaq: 'FAQ',
    signOut: 'Uitloggen',
  },
  no: {
    pageTitle: 'Mine produkter',
    loading: 'Laster...',
    noLinkedClient: 'Brukeren din er ikke koblet til noen EB Engineering-kunde.',
    noProducts: 'Du har ingen registrerte produkter ennå.',
    downloadProgram: 'Last ned tilpasset program',
    fieldPurchaseDate: 'Kjøpsdato:',
    fieldHardwareVersion: 'Maskinvareversjon:',
    fieldSerialNumber: 'Serienummer:',
    fieldSoftwareVersion: 'Programvareversjon:',
    cablesTitle: 'Tildelte kabler',
    noCables: 'Ingen kabler tildelt.',
    allRightsReserved: 'Med enerett.',
    roleClient: 'Kunde',
    tabProducts: 'Produkter',
    tabNews: 'Nyheter',
    tabFaq: 'FAQ',
    signOut: 'Logg ut',
  },
  de: {
    pageTitle: 'Meine Produkte',
    loading: 'Wird geladen...',
    noLinkedClient: 'Ihr Benutzer ist mit keinem EB Engineering-Kunden verknüpft.',
    noProducts: 'Sie haben noch keine registrierten Produkte.',
    downloadProgram: 'Individuelles Programm herunterladen',
    fieldPurchaseDate: 'Kaufdatum:',
    fieldHardwareVersion: 'Hardware-Version:',
    fieldSerialNumber: 'Seriennummer:',
    fieldSoftwareVersion: 'Software-Version:',
    cablesTitle: 'Zugewiesene Kabel',
    noCables: 'Keine Kabel zugewiesen.',
    allRightsReserved: 'Alle Rechte vorbehalten.',
    roleClient: 'Kunde',
    tabProducts: 'Produkte',
    tabNews: 'Neuigkeiten',
    tabFaq: 'FAQ',
    signOut: 'Abmelden',
  },
  sr: {
    pageTitle: 'Moji proizvodi',
    loading: 'Učitavanje...',
    noLinkedClient: 'Vaš korisnik nije povezan ni sa jednim EB Engineering klijentom.',
    noProducts: 'Još uvek nemate registrovanih proizvoda.',
    downloadProgram: 'Preuzmi prilagođeni program',
    fieldPurchaseDate: 'Datum kupovine:',
    fieldHardwareVersion: 'Verzija hardvera:',
    fieldSerialNumber: 'Serijski broj:',
    fieldSoftwareVersion: 'Verzija softvera:',
    cablesTitle: 'Dodeljeni kablovi',
    noCables: 'Nema dodeljenih kablova.',
    allRightsReserved: 'Sva prava zadržana.',
    roleClient: 'Klijent',
    tabProducts: 'Proizvodi',
    tabNews: 'Vesti',
    tabFaq: 'FAQ',
    signOut: 'Odjava',
  },
  pt: {
    pageTitle: 'Meus produtos',
    loading: 'A carregar...',
    noLinkedClient: 'O seu utilizador não está associado a nenhum cliente EB Engineering.',
    noProducts: 'Ainda não tem produtos registados.',
    downloadProgram: 'Descarregar programa personalizado',
    fieldPurchaseDate: 'Data de compra:',
    fieldHardwareVersion: 'Versão de Hardware:',
    fieldSerialNumber: 'Número de série:',
    fieldSoftwareVersion: 'Versão de Software:',
    cablesTitle: 'Cabos atribuídos',
    noCables: 'Nenhum cabo atribuído.',
    allRightsReserved: 'Todos os direitos reservados.',
    roleClient: 'Cliente',
    tabProducts: 'Produtos',
    tabNews: 'Notícias',
    tabFaq: 'FAQ',
    signOut: 'Terminar sessão',
  },
  ja: {
    pageTitle: 'マイ製品',
    loading: '読み込み中...',
    noLinkedClient: 'お客様のユーザーはEB Engineeringのクライアントに関連付けられていません。',
    noProducts: '登録された製品はまだありません。',
    downloadProgram: 'カスタムプログラムをダウンロード',
    fieldPurchaseDate: '購入日:',
    fieldHardwareVersion: 'ハードウェアバージョン:',
    fieldSerialNumber: 'シリアル番号:',
    fieldSoftwareVersion: 'ソフトウェアバージョン:',
    cablesTitle: '割り当てられたケーブル',
    noCables: '割り当てられたケーブルはありません。',
    allRightsReserved: '全著作権所有。',
    roleClient: 'クライアント',
    tabProducts: '製品',
    tabNews: 'ニュース',
    tabFaq: 'FAQ',
    signOut: 'ログアウト',
  },
}

export function ebT(lang: EbLang, key: TranslationKey): string {
  return TRANSLATIONS[lang][key]
}

function isEbLang(value: string | null): value is EbLang {
  return !!value && (EB_LANGUAGES as readonly string[]).includes(value)
}

interface EbLanguageContextValue {
  lang: EbLang
  setLang: (lang: EbLang) => void
}

const EbLanguageContext = createContext<EbLanguageContextValue | null>(null)

/**
 * Wraps the whole app (see App.tsx) so the chosen language is shared - not
 * just by the "Mis productos" page/cards, but also by UserBar and Footer
 * while a client is actually on that page (see the `isEbClientRoute` check
 * in each), so the entire page translates instead of just the product
 * details. Persisted in localStorage so a returning client keeps their pick.
 */
export function EbLanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<EbLang>(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    return isEbLang(stored) ? stored : 'es'
  })

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, lang)
  }, [lang])

  return (
    <EbLanguageContext.Provider value={{ lang, setLang }}>{children}</EbLanguageContext.Provider>
  )
}

export function useEbLanguage(): [EbLang, (lang: EbLang) => void] {
  const context = useContext(EbLanguageContext)
  if (!context) throw new Error('useEbLanguage must be used within an EbLanguageProvider')
  return [context.lang, context.setLang]
}
