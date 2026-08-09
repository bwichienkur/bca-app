"use client";

import type { AppPillar, ReportTab } from "@/lib/types";
import {
  APP_PILLARS,
  LEAGUE_SECTIONS,
  sectionUsesLeafIcon,
  type NavSection,
} from "@/lib/app-nav";
import { PillarIcon, NavTabIcon } from "./NavIcons";

type PillarNavProps = {
  activePillar: AppPillar;
  showManage: boolean;
  onSelectPillar: (pillar: AppPillar) => void;
};

function LeafIcon({
  id,
  className,
}: {
  id: ReportTab;
  className?: string;
}) {
  if (!sectionUsesLeafIcon(id)) return null;
  return (
    <NavTabIcon
      id={id as Exclude<ReportTab, "search" | "account" | "create-league">}
      className={className}
    />
  );
}

export function PillarBottomNav({
  activePillar,
  showManage,
  onSelectPillar,
}: PillarNavProps) {
  const pillars = APP_PILLARS.filter(
    (item) => item.id !== "manage" || showManage,
  );
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--line)] bg-[color-mix(in_srgb,var(--paper)_92%,transparent)] px-2 pb-[max(0.35rem,var(--safe-bottom))] pt-1.5 backdrop-blur md:hidden"
    >
      <div
        className="mx-auto grid max-w-lg gap-1"
        style={{
          gridTemplateColumns: `repeat(${pillars.length}, minmax(0, 1fr))`,
        }}
      >
        {pillars.map((pillar) => {
          const active = pillar.id === activePillar;
          return (
            <button
              key={pillar.id}
              type="button"
              aria-current={active ? "page" : undefined}
              onClick={() => onSelectPillar(pillar.id)}
              className={[
                "flex flex-col items-center justify-center gap-0.5 rounded-[var(--radius)] px-1 py-1.5 transition",
                active
                  ? "text-[var(--felt-deep)]"
                  : "text-[var(--muted)] hover:text-[var(--ink)]",
              ].join(" ")}
            >
              <span
                className={[
                  "inline-flex h-8 w-8 items-center justify-center rounded-full transition",
                  active
                    ? "bg-[color-mix(in_srgb,var(--felt)_22%,transparent)]"
                    : "bg-transparent",
                ].join(" ")}
              >
                <PillarIcon id={pillar.id} className="h-[18px] w-[18px]" />
              </span>
              <span className="text-[10px] font-semibold leading-none tracking-tight">
                {pillar.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

export function PillarSideNav({
  activePillar,
  showManage,
  onSelectPillar,
  activeSection,
  onSelectSection,
}: PillarNavProps & {
  activeSection: ReportTab | null;
  onSelectSection: (tab: ReportTab) => void;
}) {
  const pillars = APP_PILLARS.filter(
    (item) => item.id !== "manage" || showManage,
  );
  const nested = activePillar === "league" ? LEAGUE_SECTIONS : null;
  const nestedLabel = activePillar === "league" ? "League tools" : null;

  return (
    <aside className="sticky top-4 hidden w-56 shrink-0 self-start md:block">
      <p className="px-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
        Tableside
      </p>
      <nav aria-label="Main" className="mt-2 space-y-0.5">
        {pillars.map((pillar) => {
          const active = pillar.id === activePillar;
          return (
            <button
              key={pillar.id}
              type="button"
              aria-current={active ? "page" : undefined}
              onClick={() => onSelectPillar(pillar.id)}
              className={[
                "flex w-full items-center gap-2.5 rounded-[var(--radius)] px-2.5 py-2 text-left text-sm font-semibold transition",
                active
                  ? "bg-[var(--felt)] text-white shadow-sm"
                  : "text-[var(--muted)] hover:bg-[var(--surface)] hover:text-[var(--ink)]",
              ].join(" ")}
            >
              <PillarIcon id={pillar.id} className="h-4 w-4 shrink-0" />
              <span className="min-w-0 truncate">{pillar.label}</span>
            </button>
          );
        })}
      </nav>

      {nested && nestedLabel ? (
        <div className="mt-5 border-t border-[var(--line)] pt-4">
          <p className="px-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
            {nestedLabel}
          </p>
          <nav aria-label={nestedLabel} className="mt-2 space-y-0.5">
            {nested.map((section) => {
              const active = section.id === activeSection;
              return (
                <button
                  key={section.id}
                  type="button"
                  aria-current={active ? "page" : undefined}
                  onClick={() => onSelectSection(section.id)}
                  className={[
                    "flex w-full items-center gap-2 rounded-[var(--radius)] px-2.5 py-1.5 text-left text-[13px] font-semibold transition",
                    active
                      ? "bg-[color-mix(in_srgb,var(--felt)_16%,var(--surface))] text-[var(--felt-deep)]"
                      : "text-[var(--muted)] hover:bg-[var(--surface)] hover:text-[var(--ink)]",
                  ].join(" ")}
                >
                  <LeafIcon id={section.id} className="h-3.5 w-3.5 shrink-0" />
                  <span className="min-w-0 truncate">{section.label}</span>
                </button>
              );
            })}
          </nav>
        </div>
      ) : null}
    </aside>
  );
}

export function SectionChipNav({
  sections,
  activeId,
  onSelect,
  "aria-label": ariaLabel,
}: {
  sections: NavSection[];
  activeId: ReportTab;
  onSelect: (id: ReportTab) => void;
  "aria-label": string;
}) {
  return (
    <nav
      aria-label={ariaLabel}
      data-report-tabs
      className="sticky top-0 z-20 -mx-1 bg-[color-mix(in_srgb,var(--paper)_90%,transparent)] px-1 py-1 backdrop-blur md:hidden"
    >
      <div className="flex gap-1 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {sections.map((section) => {
          const active = section.id === activeId;
          return (
            <button
              key={section.id}
              type="button"
              aria-current={active ? "page" : undefined}
              onClick={() => onSelect(section.id)}
              className={[
                "inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-2 text-xs font-semibold transition",
                active
                  ? "bg-[var(--felt)] text-white shadow-sm"
                  : "bg-[var(--surface)]/90 text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)]",
              ].join(" ")}
            >
              <LeafIcon id={section.id} className="h-3.5 w-3.5" />
              {section.shortLabel ?? section.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
