import type { ScheduleDay } from "@/lib/types";

export function ScheduleList({ days }: { days: ScheduleDay[] }) {
  if (!days.length) {
    return (
      <p className="py-8 text-center text-sm text-[var(--muted)]">
        No scheduled matches found.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      {days.map((day) => (
        <section key={day.date} className="animate-rise">
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <h3 className="font-[family-name:var(--font-display)] text-lg text-[var(--felt-deep)]">
              {day.date}
            </h3>
            <span className="text-xs uppercase tracking-[0.14em] text-[var(--muted)]">
              {day.matches.length} match{day.matches.length === 1 ? "" : "es"}
            </span>
          </div>
          <ul className="space-y-2">
            {day.matches.map((match, index) => {
              const content = (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-[var(--ink)]">
                        {match.home}
                      </p>
                      <p className="mt-0.5 text-sm text-[var(--muted)]">
                        vs {match.away}
                      </p>
                    </div>
                    {match.url ? (
                      <span className="mt-1 text-[var(--amber)]" aria-hidden>
                        →
                      </span>
                    ) : null}
                  </div>
                  {match.location ? (
                    <p className="mt-2 text-xs uppercase tracking-[0.12em] text-[var(--chalk)]">
                      {match.location}
                    </p>
                  ) : null}
                </>
              );

              return (
                <li key={`${day.date}-${index}-${match.matchId ?? match.home}`}>
                  {match.url ? (
                    <a
                      href={match.url}
                      target="_blank"
                      rel="noreferrer"
                      className="block rounded-2xl border border-[var(--line)] bg-white/80 px-4 py-3 shadow-sm transition hover:border-[var(--felt-soft)] hover:bg-white"
                    >
                      {content}
                    </a>
                  ) : (
                    <div className="rounded-2xl border border-[var(--line)] bg-white/80 px-4 py-3 shadow-sm">
                      {content}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
