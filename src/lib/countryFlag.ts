import { COUNTRIES } from './countries'

// Historically EbClient.country was free text, so older records may hold an
// English name, an alternate spelling, or a raw ISO code (e.g. "HR") instead
// of the canonical Spanish name the dropdown now writes - these map those
// variants to the same ISO code the canonical name resolves to.
const CODE_BY_ALIAS: Record<string, string> = {
  spain: 'ES',
  uk: 'GB',
  'united kingdom': 'GB',
  holanda: 'NL',
  netherlands: 'NL',
  germany: 'DE',
  france: 'FR',
  italy: 'IT',
  morocco: 'MA',
  greece: 'GR',
  turkey: 'TR',
  norway: 'NO',
  sweden: 'SE',
  denmark: 'DK',
  ireland: 'IE',
  switzerland: 'CH',
  belgium: 'BE',
  cyprus: 'CY',
  algeria: 'DZ',
  tunisia: 'TN',
  'united states': 'US',
  usa: 'US',
  croatia: 'HR',
  serbia: 'RS',
  bulgaria: 'BG',
  japan: 'JP',
  portugal: 'PT',
}

function normalize(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip accents
}

const CODE_BY_NORMALIZED_NAME: Record<string, string> = {}
for (const { code, name } of COUNTRIES) {
  CODE_BY_NORMALIZED_NAME[normalize(name)] = code
}

/** Resolves free-text country input (canonical name, alias, or raw ISO code) to an ISO 3166-1 alpha-2 code. */
export function resolveCountryCode(country: string): string | null {
  const raw = country.trim()
  if (/^[a-zA-Z]{2}$/.test(raw)) return raw.toUpperCase()
  const normalized = normalize(raw)
  return CODE_BY_NORMALIZED_NAME[normalized] ?? CODE_BY_ALIAS[normalized] ?? null
}

/** Converts an ISO 3166-1 alpha-2 code into its flag emoji (regional indicator symbols). */
function flagFromCode(code: string): string {
  return code
    .toUpperCase()
    .replace(/./g, (letter) => String.fromCodePoint(127397 + letter.charCodeAt(0)))
}

/** Best-effort flag emoji for a free-text country name; '🏳️' if unrecognized. */
export function countryFlag(country: string): string {
  const code = resolveCountryCode(country)
  return code ? flagFromCode(code) : '🏳️'
}
