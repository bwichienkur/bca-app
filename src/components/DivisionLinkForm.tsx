"use client";

import { useEffect, useMemo, useState } from "react";
import type { DivisionLink, DivisionLinkValidation } from "@/lib/division-links";
import { findSisterDivision } from "@/lib/division-combos";
import { SelectField } from "./SelectField";

const inputClass =
  "w-full rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-3 py-2.5 text-sm text-[var(--ink)] outline-none ring-[var(--felt)] focus:ring-2";
const btnPrimary =
  "inline-flex items-center justify-center rounded-[var(--radius)] bg-[var(--felt)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50";
const btnGhost =
  "inline-flex items-center justify-center rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm font-semibold text-[var(--ink)] disabled:opacity-50";

type DivisionOption = { id: string; name: string };

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const payload = (await response.json().catch(() => null)) as {
    error?: string;
  } | null;
  if (!response.ok) {
    throw new Error(payload?.error || `Request failed (${response.status})`);
  }
  return payload as T;
}

function filterDivisions(
  divisions: DivisionOption[],
  query: string,
  excludeId?: string,
): DivisionOption[] {
  const q = query.trim().toLowerCase();
  return divisions.filter((division) => {
    if (excludeId && division.id === excludeId) return false;
    if (!q) return true;
    return division.name.toLowerCase().includes(q);
  });
}

/**
 * Popup form to create/edit a Tableside-only division link.
 * Never writes to LMS.
 */
export function DivisionLinkForm({
  leagueId,
  divisions,
  initialLink = null,
  busy,
  onBusy,
  onNotice,
  onError,
  onSaved,
}: {
  leagueId: string;
  divisions: DivisionOption[];
  initialLink?: DivisionLink | null;
  busy: boolean;
  onBusy: (busy: boolean) => void;
  onNotice: (message: string | null) => void;
  onError: (message: string | null) => void;
  onSaved: (link: DivisionLink) => void;
}) {
  const [linkName, setLinkName] = useState(initialLink?.name ?? "");
  const [primaryDivisionId, setPrimaryDivisionId] = useState(
    initialLink?.primaryDivisionId ?? "",
  );
  const [linkedDivisionId, setLinkedDivisionId] = useState(
    initialLink?.linkedDivisionId ?? "",
  );
  const [primaryQuery, setPrimaryQuery] = useState("");
  const [linkedQuery, setLinkedQuery] = useState("");
  const [validation, setValidation] = useState<DivisionLinkValidation | null>(
    null,
  );

  useEffect(() => {
    setLinkName(initialLink?.name ?? "");
    setPrimaryDivisionId(initialLink?.primaryDivisionId ?? "");
    setLinkedDivisionId(initialLink?.linkedDivisionId ?? "");
    setPrimaryQuery("");
    setLinkedQuery("");
    setValidation(null);
  }, [initialLink]);

  const primaryDivision =
    divisions.find((d) => d.id === primaryDivisionId) ?? null;
  const linkedDivision =
    divisions.find((d) => d.id === linkedDivisionId) ?? null;

  const sisterSuggestion = useMemo(() => {
    if (!primaryDivision) return null;
    return (
      findSisterDivision(primaryDivision, divisions)?.sister ?? null
    );
  }, [primaryDivision, divisions]);

  const primaryOptions = useMemo(
    () => filterDivisions(divisions, primaryQuery, linkedDivisionId),
    [divisions, primaryQuery, linkedDivisionId],
  );
  const linkedOptions = useMemo(
    () => filterDivisions(divisions, linkedQuery, primaryDivisionId),
    [divisions, linkedQuery, primaryDivisionId],
  );

  const runValidate = async () => {
    if (!primaryDivisionId || !linkedDivisionId) {
      onError("Pick two divisions to link.");
      return null;
    }
    onBusy(true);
    onError(null);
    try {
      const data = await fetchJson<{ validation: DivisionLinkValidation }>(
        "/api/division-links",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "validate",
            primaryDivisionId,
            primaryDivisionName: primaryDivision?.name ?? primaryDivisionId,
            linkedDivisionId,
            linkedDivisionName: linkedDivision?.name ?? linkedDivisionId,
          }),
        },
      );
      setValidation(data.validation);
      return data.validation;
    } catch (error) {
      onError(
        error instanceof Error ? error.message : "Validation failed.",
      );
      return null;
    } finally {
      onBusy(false);
    }
  };

  const saveLink = async () => {
    const name = linkName.trim();
    if (!name) {
      onError("Name the link (players will see this in League).");
      return;
    }
    if (!primaryDivisionId || !linkedDivisionId) {
      onError("Pick two divisions to link.");
      return;
    }
    onBusy(true);
    onError(null);
    onNotice(null);
    try {
      const data = await fetchJson<{
        link: DivisionLink;
        validation: DivisionLinkValidation;
      }>("/api/division-links", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: initialLink?.id,
          leagueId,
          name,
          primaryDivisionId,
          primaryDivisionName: primaryDivision?.name ?? primaryDivisionId,
          linkedDivisionId,
          linkedDivisionName: linkedDivision?.name ?? linkedDivisionId,
        }),
      });
      setValidation(data.validation);
      onNotice(
        "Division link saved in Tableside only — LMS was not updated.",
      );
      onSaved(data.link);
    } catch (error) {
      onError(error instanceof Error ? error.message : "Failed to save link.");
    } finally {
      onBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-[var(--radius)] border border-[var(--amber)]/35 bg-[color-mix(in_srgb,var(--amber)_12%,transparent)] px-3 py-2 text-sm text-[var(--amber)]">
        Tableside-only. Linking does not change LMS. Players see the link name
        once and Tableside combines standings / schedule / score for both
        halves. Divisions must share the exact same team names (or exact same
        individuals).
      </div>

      <div className="grid gap-3">
        <label className="block space-y-1.5 text-sm">
          <span className="font-medium text-[var(--ink)]">Link name</span>
          <input
            className={inputClass}
            value={linkName}
            placeholder="e.g. Beyond Monday 2026.2"
            onChange={(e) => setLinkName(e.target.value)}
          />
        </label>

        <div className="space-y-1.5">
          <span className="text-sm font-medium text-[var(--ink)]">
            First division
          </span>
          <input
            className={inputClass}
            value={primaryQuery}
            placeholder="Search divisions…"
            onChange={(e) => setPrimaryQuery(e.target.value)}
          />
          <SelectField
            aria-label="First division"
            value={primaryDivisionId}
            options={[
              { value: "", label: "Choose division…" },
              ...primaryOptions.map((d) => ({
                value: d.id,
                label: d.name,
              })),
            ]}
            onChange={(value) => {
              setPrimaryDivisionId(value);
              setValidation(null);
              const picked = divisions.find((d) => d.id === value);
              if (picked && !linkName.trim()) {
                const season =
                  picked.name.match(/\(?\s*(20\d{2}\.\d)\s*\)?/i)?.[1] ?? "";
                if (season) setLinkName(`Beyond Monday ${season}`);
              }
              if (value && linkedDivisionId === value) {
                setLinkedDivisionId("");
              }
            }}
          />
        </div>

        <div className="space-y-1.5">
          <span className="text-sm font-medium text-[var(--ink)]">
            Second division
          </span>
          <input
            className={inputClass}
            value={linkedQuery}
            placeholder="Search divisions…"
            onChange={(e) => setLinkedQuery(e.target.value)}
          />
          <SelectField
            aria-label="Second division"
            value={linkedDivisionId}
            options={[
              { value: "", label: "Choose division…" },
              ...linkedOptions.map((d) => ({
                value: d.id,
                label: d.name,
              })),
            ]}
            onChange={(value) => {
              setLinkedDivisionId(value);
              setValidation(null);
            }}
          />
          {sisterSuggestion && linkedDivisionId !== sisterSuggestion.id ? (
            <button
              type="button"
              className="text-xs font-semibold text-[var(--felt-deep)] underline-offset-2 hover:underline"
              onClick={() => {
                setLinkedDivisionId(sisterSuggestion.id);
                setLinkedQuery("");
                setValidation(null);
                if (!linkName.trim() && primaryDivision) {
                  const season =
                    primaryDivision.name.match(
                      /\(?\s*(20\d{2}\.\d)\s*\)?/i,
                    )?.[1] ?? "";
                  setLinkName(
                    season ? `Beyond Monday ${season}` : "Beyond Monday",
                  );
                }
              }}
            >
              Suggest {sisterSuggestion.name}
            </button>
          ) : null}
        </div>
      </div>

      {validation ? (
        <div
          className={[
            "rounded-[var(--radius)] border px-3 py-2 text-sm",
            validation.ok
              ? "border-[var(--felt)]/35 bg-[color-mix(in_srgb,var(--felt)_14%,transparent)] text-[var(--felt-deep)]"
              : "border-[var(--danger)]/30 bg-[var(--danger-bg)] text-[var(--danger)]",
          ].join(" ")}
        >
          <p>{validation.message}</p>
          {!validation.ok &&
          (validation.missingInPrimary.length ||
            validation.missingInLinked.length) ? (
            <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs">
              {validation.missingInPrimary.map((item) => (
                <li key={`p-${item}`}>Missing in first: {item}</li>
              ))}
              {validation.missingInLinked.map((item) => (
                <li key={`l-${item}`}>Missing in second: {item}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={btnGhost}
          disabled={busy || !primaryDivisionId || !linkedDivisionId}
          onClick={() => void runValidate()}
        >
          Check match
        </button>
        <button
          type="button"
          className={btnPrimary}
          disabled={
            busy ||
            !primaryDivisionId ||
            !linkedDivisionId ||
            !linkName.trim()
          }
          onClick={() => void saveLink()}
        >
          {initialLink ? "Update link" : "Save link"}
        </button>
      </div>
    </div>
  );
}
