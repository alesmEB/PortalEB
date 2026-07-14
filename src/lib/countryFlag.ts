// EbClient.country is free text (no fixed list/country code), so this is a
// best-effort lookup by normalized name covering the countries this business
// actually deals with - not an exhaustive ISO mapping. Falls back to a
// neutral placeholder for anything unrecognized rather than guessing wrong.
const FLAG_BY_COUNTRY: Record<string, string> = {
  espana: '🇪🇸',
  spain: '🇪🇸',
  portugal: '🇵🇹',
  francia: '🇫🇷',
  france: '🇫🇷',
  italia: '🇮🇹',
  italy: '🇮🇹',
  marruecos: '🇲🇦',
  morocco: '🇲🇦',
  gibraltar: '🇬🇮',
  andorra: '🇦🇩',
  'reino unido': '🇬🇧',
  'united kingdom': '🇬🇧',
  uk: '🇬🇧',
  alemania: '🇩🇪',
  germany: '🇩🇪',
  'paises bajos': '🇳🇱',
  holanda: '🇳🇱',
  netherlands: '🇳🇱',
  belgica: '🇧🇪',
  belgium: '🇧🇪',
  suiza: '🇨🇭',
  switzerland: '🇨🇭',
  grecia: '🇬🇷',
  greece: '🇬🇷',
  turquia: '🇹🇷',
  turkey: '🇹🇷',
  malta: '🇲🇹',
  chipre: '🇨🇾',
  cyprus: '🇨🇾',
  noruega: '🇳🇴',
  norway: '🇳🇴',
  suecia: '🇸🇪',
  sweden: '🇸🇪',
  dinamarca: '🇩🇰',
  denmark: '🇩🇰',
  irlanda: '🇮🇪',
  ireland: '🇮🇪',
  'estados unidos': '🇺🇸',
  'united states': '🇺🇸',
  usa: '🇺🇸',
  mexico: '🇲🇽',
  argelia: '🇩🇿',
  algeria: '🇩🇿',
  tunez: '🇹🇳',
  tunisia: '🇹🇳',
}

function normalize(country: string): string {
  return country
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip accents
}

/** Best-effort flag emoji for a free-text country name; '🏳️' if unrecognized. */
export function countryFlag(country: string): string {
  return FLAG_BY_COUNTRY[normalize(country)] ?? '🏳️'
}
