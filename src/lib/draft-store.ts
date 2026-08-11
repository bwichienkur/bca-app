import {
  summarizeDraftForBoard,
  type DraftBoardSummary,
  type GameScoreState,
  type ScoringDraft,
} from "./scoring";
import { getRedis, isRedisConfigured } from "./redis";

function gameResultEqual(
  a: GameScoreState | undefined,
  b: GameScoreState | undefined,
): boolean {
  if (!a || !b) return false;
  return (
    a.teamOneScore === b.teamOneScore &&
    a.teamTwoScore === b.teamTwoScore &&
    a.winAdornment === b.winAdornment &&
    a.isWinZip === b.isWinZip
  );
}

/**
 * Keep per-game scoredBy when a game's result did not change, so overwriting
 * one matchup does not make every other game look authored by the opener.
 */
function mergeGameAuthorship(args: {
  previous: ScoringDraft["games"] | undefined;
  next: ScoringDraft["games"];
  updatedBy: string;
  updatedByName: string;
}): ScoringDraft["games"] {
  const prev = args.previous ?? {};
  const out: ScoringDraft["games"] = {};
  for (const [key, game] of Object.entries(args.next)) {
    const prior = prev[key];
    if (prior && gameResultEqual(prior, game)) {
      out[key] = {
        ...game,
        scoredBy: (game.scoredBy || prior.scoredBy || "").trim() || null,
        scoredByName:
          (game.scoredByName || prior.scoredByName || "").trim() || null,
      };
      continue;
    }
    out[key] = {
      ...game,
      scoredBy: (game.scoredBy || args.updatedBy || "").trim() || null,
      scoredByName:
        (game.scoredByName || args.updatedByName || "").trim() || null,
    };
  }
  return out;
}

const KEY_PREFIX = "tableside:scoring:draft:v1:";
/** Free-tier friendly: drafts expire if abandoned. */
const DRAFT_TTL_SECONDS = 60 * 60 * 24 * 60; // 60 days

export type SharedDraftRecord = {
  draft: ScoringDraft;
  updatedBy: string;
  /** Display name of the scorer who last wrote the draft (best-effort). */
  updatedByName: string;
  submittedAt: string | null;
};

/** True when Upstash / Vercel KV REST credentials are present. */
export function isDraftStoreConfigured(): boolean {
  return isRedisConfigured();
}

function draftKey(matchId: string): string {
  return KEY_PREFIX + matchId;
}

function isScoringDraft(value: unknown): value is ScoringDraft {
  if (!value || typeof value !== "object") return false;
  const draft = value as ScoringDraft;
  return (
    typeof draft.matchId === "string" &&
    typeof draft.updatedAt === "string" &&
    Array.isArray(draft.teamOneLineup) &&
    Array.isArray(draft.teamTwoLineup) &&
    !!draft.games &&
    typeof draft.games === "object"
  );
}

function normalizeRecord(value: unknown): SharedDraftRecord | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<SharedDraftRecord> & ScoringDraft;
  // Accept either wrapped { draft, ... } or a bare ScoringDraft for forward-compat.
  if (isScoringDraft(raw.draft)) {
    return {
      draft: raw.draft,
      updatedBy: typeof raw.updatedBy === "string" ? raw.updatedBy : "",
      updatedByName:
        typeof raw.updatedByName === "string" ? raw.updatedByName : "",
      submittedAt:
        typeof raw.submittedAt === "string" || raw.submittedAt === null
          ? (raw.submittedAt as string | null)
          : null,
    };
  }
  if (isScoringDraft(raw)) {
    return {
      draft: raw,
      updatedBy: "",
      updatedByName: "",
      submittedAt: null,
    };
  }
  return null;
}

export async function getSharedDraft(
  matchId: string,
): Promise<SharedDraftRecord | null> {
  const redis = getRedis();
  if (!redis) return null;
  const value = await redis.get<unknown>(draftKey(matchId));
  return normalizeRecord(value);
}

export async function putSharedDraft(args: {
  matchId: string;
  draft: ScoringDraft;
  updatedBy: string;
  updatedByName?: string | null;
  /** Client's last-seen server updatedAt; used for optimistic concurrency. */
  baseUpdatedAt?: string | null;
}): Promise<
  | { ok: true; record: SharedDraftRecord; shared: true }
  | {
      ok: false;
      conflict: true;
      record: SharedDraftRecord;
      shared: true;
    }
  | { ok: false; shared: false; error: string }
> {
  const redis = getRedis();
  if (!redis) {
    return {
      ok: false,
      shared: false,
      error:
        "Shared draft store is not configured. Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN (or Vercel KV REST vars).",
    };
  }

  const existing = await getSharedDraft(args.matchId);
  if (
    existing &&
    args.baseUpdatedAt != null &&
    args.baseUpdatedAt !== "" &&
    existing.draft.updatedAt !== args.baseUpdatedAt &&
    Date.parse(existing.draft.updatedAt) > Date.parse(args.draft.updatedAt)
  ) {
    return { ok: false, conflict: true, record: existing, shared: true };
  }

  // Last-write-wins when the incoming draft is strictly older than stored.
  if (
    existing &&
    Date.parse(existing.draft.updatedAt) > Date.parse(args.draft.updatedAt)
  ) {
    return { ok: false, conflict: true, record: existing, shared: true };
  }

  const writerName = (args.updatedByName ?? "").trim();
  const mergedGames = mergeGameAuthorship({
    previous: existing?.draft.games,
    next: args.draft.games,
    updatedBy: args.updatedBy,
    updatedByName: writerName,
  });

  const record: SharedDraftRecord = {
    draft: {
      ...args.draft,
      matchId: args.matchId,
      games: mergedGames,
    },
    updatedBy: args.updatedBy,
    updatedByName: writerName,
    submittedAt: existing?.submittedAt ?? null,
  };

  await redis.set(draftKey(args.matchId), record, {
    ex: DRAFT_TTL_SECONDS,
  });

  return { ok: true, record, shared: true };
}

export async function markSharedDraftSubmitted(
  matchId: string,
  updatedBy: string,
  updatedByName?: string | null,
): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  const existing = await getSharedDraft(matchId);
  if (!existing) return;
  const nextName = (updatedByName ?? "").trim();
  const record: SharedDraftRecord = {
    ...existing,
    updatedBy,
    updatedByName:
      nextName ||
      (existing.updatedBy === updatedBy ? existing.updatedByName : ""),
    submittedAt: new Date().toISOString(),
  };
  await redis.set(draftKey(matchId), record, { ex: DRAFT_TTL_SECONDS });
}

/** Clear a false Tableside submit lock when LMS never marked the match played. */
export async function clearSharedDraftSubmitted(
  matchId: string,
): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  const existing = await getSharedDraft(matchId);
  if (!existing || !existing.submittedAt) return;
  const record: SharedDraftRecord = {
    ...existing,
    submittedAt: null,
  };
  await redis.set(draftKey(matchId), record, { ex: DRAFT_TTL_SECONDS });
}

export async function deleteSharedDraft(matchId: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  await redis.del(draftKey(matchId));
}

export async function whichSharedDraftsExist(
  matchIds: string[],
): Promise<string[]> {
  const redis = getRedis();
  if (!redis || matchIds.length === 0) return [];

  const keys = matchIds.map(draftKey);
  // mget returns null for missing keys; preserve order.
  const values = (await redis.mget(...keys)) as unknown as Array<
    SharedDraftRecord | ScoringDraft | null
  >;
  const found: string[] = [];
  for (let i = 0; i < matchIds.length; i++) {
    const record = normalizeRecord(values[i]);
    if (record && !record.submittedAt) found.push(matchIds[i]!);
  }
  return found;
}

/** Load board summaries for many match ids (includes in-progress + submitted drafts). */
export async function getSharedDraftSummaries(
  matchIds: string[],
): Promise<Record<string, DraftBoardSummary>> {
  const redis = getRedis();
  const out: Record<string, DraftBoardSummary> = {};
  if (!redis || matchIds.length === 0) return out;

  const keys = matchIds.map(draftKey);
  const values = (await redis.mget(...keys)) as unknown as Array<
    SharedDraftRecord | ScoringDraft | null
  >;
  for (let i = 0; i < matchIds.length; i++) {
    const matchId = matchIds[i]!;
    const record = normalizeRecord(values[i]);
    if (!record) continue;
    out[matchId] = summarizeDraftForBoard(record.draft, record.submittedAt);
  }
  return out;
}
