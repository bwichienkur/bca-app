type MyTeamSectionHeaderProps = {
  title: string;
  description: string;
};

/** Shared title + one-line support copy for My Team sub-tabs. */
export function MyTeamSectionHeader({
  title,
  description,
}: MyTeamSectionHeaderProps) {
  return (
    <div className="min-w-0">
      <h3 className="font-[family-name:var(--font-display)] text-xl text-[var(--felt-deep)]">
        {title}
      </h3>
      <p className="mt-1 text-sm text-[var(--muted)]">{description}</p>
    </div>
  );
}
