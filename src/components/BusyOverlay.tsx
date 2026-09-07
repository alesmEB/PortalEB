/** Full-screen "working on it" veil, shown while a mutation and the refetch
 * that follows it are in flight. Sits above the modals (z-50) so it also
 * covers a dialog that stays open while its save round-trips. */
export function BusyOverlay({ label }: { label: string | null }) {
  if (!label) return null
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/30 backdrop-blur-[1px]">
      <div className="flex items-center gap-3 rounded-xl bg-white px-4 py-3 shadow-xl">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-eb-blue" />
        <p className="text-sm text-slate-700">{label}</p>
      </div>
    </div>
  )
}
