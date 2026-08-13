"use client";

import type { AppPillar, ReportTab } from "@/lib/types";
import {
  APP_PILLARS,
  LEAGUE_SECTIONS,
  sectionUsesLeafIcon,
} from "@/lib/app-nav";
import { useVirtualKeyboardOpen } from "@/lib/use-virtual-keyboard";
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
  const keyboardOpen = useVirtualKeyboardOpen();
  const pillars = APP_PILLARS.filter(
    (item) => item.id !== "manage" || showManage,
  );
  if (keyboardOpen) return null;
  return (
    <nav
      aria-label="Main"
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-[var(--line)] bg-[color-mix(in_srgb,var(--paper)_94%,transparent)] px-2 pb-[max(0.5rem,var(--safe-bottom))] pt-2 backdrop-blur-md md:hidden"
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
                "flex flex-col items-center justify-center gap-1 rounded-[var(--radius)] px-1 py-1.5 transition",
                active
                  ? "text-[var(--felt-deep)]"
                  : "text-[var(--muted)] hover:text-[var(--ink)]",
              ].join(" ")}
            >
              <span
                className={[
                  "inline-flex h-9 w-9 items-center justify-center rounded-full transition",
                  active
                    ? "bg-[color-mix(in_srgb,var(--felt)_28%,transparent)]"
                    : "bg-transparent",
                ].join(" ")}
              >
                <PillarIcon id={pillar.id} className="h-5 w-5" />
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
