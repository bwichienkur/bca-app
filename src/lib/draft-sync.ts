import type { DraftBoardSummary, ScoringDraft } from "./scoring";

export type RemoteDraftResponse = {
  shared: boolean;
  draft: ScoringDraft | null;
  updatedBy?: string | null;
  updatedByName?: string | null;
  submittedAt?: string | null;
  conflict?: boolean;
  error?: string;
};

async function parseJson<T>(response: Response): Promise<T> {
  return (await response.json().catch(() => ({}))) as T;
}

/** Fetch shared draft for a match. Returns null draft when missing/unconfigured. */
export async function fetchRemoteDraft(
  matchId: string,
): Promise<RemoteDraftResponse> {
  const response = await fetch(
    `/api/scoring/drafts/${encodeURIComponent(matchId)}`,
    { cache: "no-store" },
  );
  const payload = await parseJson<RemoteDraftResponse & { error?: string }>(
    response,
  );
  if (!response.ok) {
    throw new Error(payload.error || `Draft fetch failed (${response.status})`);
  }
  return payload;
}

/** Persist draft to shared store. 409 → conflict with newer remote draft. */
export async function pushRemoteDraft(
  draft: ScoringDraft,
  baseUpdatedAt?: string | null,
): Promise<RemoteDraftResponse> {
  const response = await fetch(
    `/api/scoring/drafts/${encodeURIComponent(draft.matchId)}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ draft, baseUpdatedAt }),
      cache: "no-store",
    },
  );
  const payload = await parseJson<RemoteDraftResponse & { error?: string }>(
    response,
  );
  if (response.status === 409) {
    return { ...payload, conflict: true, shared: true };
  }
  if (response.status === 503) {
    return { ...payload, shared: false };
  }
  if (!response.ok) {
    throw new Error(payload.error || `Draft save failed (${response.status})`);
  }
  return payload;
}

export async function deleteRemoteDraft(matchId: string): Promise<void> {
  await fetch(`/api/scoring/drafts/${encodeURIComponent(matchId)}`, {
    method: "DELETE",
    cache: "no-store",
  });
}

export async function fetchRemoteDraftMatchIds(
  matchIds: string[],
): Promise<{ shared: boolean; matchIds: string[] }> {
  if (matchIds.length === 0) return { shared: false, matchIds: [] };
  const response = await fetch(
    `/api/scoring/drafts?ids=${encodeURIComponent(matchIds.join(","))}`,
    { cache: "no-store" },
  );
  const payload = await parseJson<{
    shared?: boolean;
    matchIds?: string[];
    error?: string;
  }>(response);
  if (!response.ok) {
    throw new Error(payload.error || `Draft list failed (${response.status})`);
  }
  return {
    shared: Boolean(payload.shared),
    matchIds: payload.matchIds ?? [],
  };
}

/** Fetch live board summaries (rounds/games + status) for many matches. */
export async function fetchRemoteDraftSummaries(
  matchIds: string[],
): Promise<{
  shared: boolean;
  summaries: Record<string, DraftBoardSummary>;
  matchIds: string[];
}> {
  if (matchIds.length === 0) {
    return { shared: false, summaries: {}, matchIds: [] };
  }
  const response = await fetch(
    `/api/scoring/drafts?ids=${encodeURIComponent(matchIds.join(","))}&summaries=1`,
    { cache: "no-store" },
  );
  const payload = await parseJson<{
    shared?: boolean;
    summaries?: Record<string, DraftBoardSummary>;
    matchIds?: string[];
    error?: string;
  }>(response);
  if (!response.ok) {
    throw new Error(
      payload.error || `Draft summaries failed (${response.status})`,
    );
  }
  return {
    shared: Boolean(payload.shared),
    summaries: payload.summaries ?? {},
    matchIds: payload.matchIds ?? [],
  };
}

/** Pick the newer draft by updatedAt; prefer `preferred` on ties. */
export function newerDraft(
  a: ScoringDraft | null | undefined,
  b: ScoringDraft | null | undefined,
  preferred: "a" | "b" = "a",
): ScoringDraft | null {
  if (!a) return b ?? null;
  if (!b) return a;
  const ta = Date.parse(a.updatedAt);
  const tb = Date.parse(b.updatedAt);
  if (Number.isNaN(ta) && Number.isNaN(tb)) return preferred === "a" ? a : b;
  if (Number.isNaN(ta)) return b;
  if (Number.isNaN(tb)) return a;
  if (ta === tb) return preferred === "a" ? a : b;
  return ta > tb ? a : b;
}
