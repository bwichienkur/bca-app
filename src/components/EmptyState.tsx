import type { ReactNode } from "react";
import { Inbox } from "lucide-react";

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="ui-card animate-panel px-6 py-14 text-center md:px-10">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-[var(--line)] bg-[var(--surface-2)] text-[var(--muted)]">
        <Inbox className="h-5 w-5" aria-hidden />
      </div>
      <h3 className="mt-5 text-xl font-semibold tracking-tight text-[var(--ink)]">
        {title}
      </h3>
      {body ? (
        <p className="mx-auto mt-3 max-w-md text-[15px] leading-relaxed text-[var(--muted)]">
          {body}
        </p>
      ) : null}
      {action ? <div className="mt-6 flex justify-center">{action}</div> : null}
    </div>
  );
}
