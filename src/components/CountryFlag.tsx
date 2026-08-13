import * as Flags from 'country-flag-icons/react/3x2'
import type { ComponentType } from 'react'
import { resolveCountryCode } from '../lib/countryFlag'

// Renders an actual SVG flag instead of a Unicode flag emoji - Windows/Chrome
// doesn't compose the two-letter "regional indicator" emoji sequence into a
// flag picture (it shows the raw letters instead), so relying on the emoji
// here looked broken for every country except the single-codepoint white
// flag fallback.
export function CountryFlag({ country, className = 'h-3 w-4' }: { country: string; className?: string }) {
  const code = resolveCountryCode(country)
  const Flag = code ? (Flags as unknown as Record<string, ComponentType<{ className?: string; title?: string }>>)[code] : undefined
  if (!Flag) return null
  return <Flag className={`inline-block shrink-0 rounded-sm ${className}`} title={country} />
}
