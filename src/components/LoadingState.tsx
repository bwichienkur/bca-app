export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <div
      className="animate-panel space-y-4 py-4"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <p className="sr-only">{label}</p>
      <div className="ui-skeleton h-8 w-40" />
      <div className="ui-skeleton h-4 w-72 max-w-full" />
      <div className="mt-6 space-y-3">
        <div className="ui-skeleton h-20 w-full" />
        <div className="ui-skeleton h-20 w-full" />
        <div className="ui-skeleton h-20 w-full opacity-70" />
      </div>
    </div>
  );
}
