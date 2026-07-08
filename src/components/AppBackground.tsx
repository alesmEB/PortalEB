import backgroundImage from '../assets/branding/background-eb.webp'

/**
 * Fixed, faded backdrop shared by every page. Sits behind all content via
 * negative z-index so pages don't need to know about it.
 */
export function AppBackground() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 bg-slate-50"
    >
      <div
        className="h-full w-full bg-cover bg-center opacity-[0.12]"
        style={{ backgroundImage: `url(${backgroundImage})` }}
      />
    </div>
  )
}
