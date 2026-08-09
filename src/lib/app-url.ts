import type { ReportTab } from "@/lib/types";

const REPORT_TABS: ReportTab[] = [
  "my-team",
  "standings",
  "players",
  "schedule",
  "handicap",
  "events",
  "search",
  "score",
  "lms",
  "create-league",
  "account",
];

export type AppUrlState = {
  tab: ReportTab | null;
  eventId: string | null;
};

export function parseReportTab(value: string | null | undefined): ReportTab | null {
  if (!value) return null;
  return REPORT_TABS.includes(value as ReportTab) ? (value as ReportTab) : null;
}

export function readAppUrlState(
  search = typeof window !== "undefined" ? window.location.search : "",
): AppUrlState {
  const params = new URLSearchParams(search);
  const eventId = params.get("event")?.trim() || null;
  const tab = parseReportTab(params.get("tab")) ?? (eventId ? "events" : null);
  return { tab, eventId };
}

/** Write tab/event query params. Preserves unrelated search params. */
export function writeAppUrlState(
  next: { tab: ReportTab; eventId?: string | null },
  mode: "push" | "replace" = "replace",
): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.set("tab", next.tab);
  const eventId = next.eventId?.trim() || "";
  if (next.tab === "events" && eventId) {
    url.searchParams.set("event", eventId);
  } else {
    url.searchParams.delete("event");
  }
  const href = `${url.pathname}${url.search}${url.hash}`;
  if (mode === "push") {
    window.history.pushState(null, "", href);
  } else {
    window.history.replaceState(null, "", href);
  }
}

export function eventDeepLinkPath(eventId: string): string {
  const id = eventId.trim();
  const params = new URLSearchParams({ tab: "events", event: id });
  return `/?${params.toString()}`;
}
