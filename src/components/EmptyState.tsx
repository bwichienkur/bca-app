export function EmptyState({
  title,
  body,
}: {
  title: string;
  body?: string;
}) {
  return (
    <div className="rounded-[var(--radius)] border border-dashed border-[var(--line)] bg-white/50 px-5 py-10 text-center">
      <h3 className="font-[family-name:var(--font-display)] text-xl text-[var(--ink)]">
        {title}
      </h3>
      {body ? <p className="mt-2 text-sm text-[var(--muted)]">{body}</p> : null}
    </div>
  );
}
