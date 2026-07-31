export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <div className="flex items-center gap-2">
        <span className="loading-dot h-2.5 w-2.5 rounded-full bg-[var(--felt)]" />
        <span className="loading-dot h-2.5 w-2.5 rounded-full bg-[var(--chalk)]" />
        <span className="loading-dot h-2.5 w-2.5 rounded-full bg-[var(--amber)]" />
      </div>
      <p className="text-sm text-[var(--muted)]">{label}</p>
    </div>
  );
}
