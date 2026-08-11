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
const btnDelete =
  "inline-flex items-center justify-center rounded-[var(--radius)] bg-[#b42318] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50";

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

export function DivisionLinkPanel({
  leagueId,
  divisionId,
  divisionName,
  divisions,
  busy,
  onBusy,
  onNotice,
  onError,
}: {
  leagueId: string;
  divisionId: string;
  divisionName: string;
  divisions: DivisionOption[];
  busy: boolean;
  onBusy: (busy: boolean) => void;
  onNotice: (message: string | null) => void;
  onError: (message: string | null) => void;
}) {
  const [links, setLinks] = useState<DivisionLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [linkName, setLinkName] = useState("");
  const [linkedDivisionId, setLinkedDivisionId] = useState("");
  const [validation, setValidation] = useState<DivisionLinkValidation | null>(
    null,
  );

  const existing = useMemo(
    () =>
      links.find(
        (link) =>
          link.primaryDivisionId === divisionId ||
          link.linkedDivisionId === divisionId,
      ) ?? null,
    [links, divisionId],
  );

  const sisterSuggestion = useMemo(() => {
    const hit = findSisterDivision(
      { id: divisionId, name: divisionName },
      divisions,
    );
    return hit?.sister ?? null;
  }, [divisionId, divisionName, divisions]);

  const otherDivisions = useMemo(
    () => divisions.filter((d) => d.id !== divisionId),
    [divisions, divisionId],
  );

  const refresh = async () => {
    setLoading(true);
    try {
      const data = await fetchJson<{ links: DivisionLink[] }>(
        `/api/division-links?leagueId=${encodeURIComponent(leagueId)}`,
      );
      setLinks(data.links ?? []);
    } catch (error) {
      onError(
        error instanceof Error ? error.message : "Failed to load links.",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leagueId, divisionId]);

  useEffect(() => {
    if (existing) {
      setLinkName(existing.name);
      setLinkedDivisionId(
        existing.primaryDivisionId === divisionId
          ? existing.linkedDivisionId
          : existing.primaryDivisionId,
      );
      return;
    }
    setLinkName("");
    setLinkedDivisionId(sisterSuggestion?.id ?? "");
    setValidation(null);
  }, [existing, divisionId, sisterSuggestion?.id]);

  const linkedName =
    otherDivisions.find((d) => d.id === linkedDivisionId)?.name ?? "";

  const runValidate = async () => {
    if (!linkedDivisionId) {
      onError("Pick a division to link.");
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
            primaryDivisionId: divisionId,
            primaryDivisionName: divisionName,
            linkedDivisionId,
            linkedDivisionName: linkedName,
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
    if (!linkedDivisionId) {
      onError("Pick a division to link.");
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
          id: existing?.id,
          leagueId,
          name,
          primaryDivisionId: divisionId,
          primaryDivisionName: divisionName,
          linkedDivisionId,
          linkedDivisionName: linkedName,
        }),
      });
      setValidation(data.validation);
      setLinks((prev) => {
        const without = prev.filter(
          (link) =>
            link.id !== data.link.id &&
            link.primaryDivisionId !== data.link.primaryDivisionId &&
            link.linkedDivisionId !== data.link.primaryDivisionId &&
            link.primaryDivisionId !== data.link.linkedDivisionId &&
            link.linkedDivisionId !== data.link.linkedDivisionId,
        );
        return [...without, data.link];
      });
      onNotice(
        "Division link saved in Tableside only — LMS was not updated.",
      );
    } catch (error) {
      onError(error instanceof Error ? error.message : "Failed to save link.");
    } finally {
      onBusy(false);
    }
  };

  const unlink = async () => {
    if (!existing) return;
    onBusy(true);
    onError(null);
    onNotice(null);
    try {
      await fetchJson(
        `/api/division-links?leagueId=${encodeURIComponent(leagueId)}&linkId=${encodeURIComponent(existing.id)}`,
        { method: "DELETE" },
      );
      setLinks((prev) => prev.filter((link) => link.id !== existing.id));
      setLinkName("");
      setLinkedDivisionId(sisterSuggestion?.id ?? "");
      setValidation(null);
      onNotice("Division link removed from Tableside.");
    } catch (error) {
      onError(
        error instanceof Error ? error.message : "Failed to remove link.",
      );
    } finally {
      onBusy(false);
    }
  };

  if (loading) {
    return (
      <p className="text-sm text-[var(--muted)]">Loading division links…</p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-[var(--radius)] border border-[var(--amber)]/35 bg-[color-mix(in_srgb,var(--amber)_12%,transparent)] px-3 py-2 text-sm text-[var(--amber)]">
        Tableside-only. Linking does not change LMS. Players see the link name
        once and Tableside combines standings / schedule / score for both
        halves. Divisions must share the exact same team names (or exact same
        individuals).
      </div>

      {existing ? (
        <p className="text-sm text-[var(--felt-deep)]">
          Linked as <span className="font-semibold">{existing.name}</span> (
          {existing.mode}) with{" "}
          {existing.primaryDivisionId === divisionId
            ? existing.linkedDivisionName
            : existing.primaryDivisionName}
          .
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1.5 text-sm sm:col-span-2">
          <span className="font-medium text-[var(--ink)]">Link name</span>
          <input
            className={inputClass}
            value={linkName}
            placeholder="e.g. Beyond Monday 2026.2"
            onChange={(e) => setLinkName(e.target.value)}
          />
        </label>
        <label className="block space-y-1.5 text-sm sm:col-span-2">
          <span className="font-medium text-[var(--ink)]">
            Link with division
          </span>
          <SelectField
            aria-label="Division to link"
            value={linkedDivisionId}
            options={[
              { value: "", label: "Choose division…" },
              ...otherDivisions.map((d) => ({
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
              className="mt-1 text-xs font-semibold text-[var(--felt-deep)] underline-offset-2 hover:underline"
              onClick={() => {
                setLinkedDivisionId(sisterSuggestion.id);
                if (!linkName.trim()) {
                  const season =
                    divisionName.match(/\(?\s*(20\d{2}\.\d)\s*\)?/i)?.[1] ?? "";
                  setLinkName(
                    season
                      ? `Beyond Monday ${season}`
                      : "Beyond Monday",
                  );
                }
              }}
            >
              Suggest {sisterSuggestion.name}
            </button>
          ) : null}
        </label>
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
                <li key={`p-${item}`}>Missing here: {item}</li>
              ))}
              {validation.missingInLinked.map((item) => (
                <li key={`l-${item}`}>Missing in linked: {item}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={btnGhost}
          disabled={busy || !linkedDivisionId}
          onClick={() => void runValidate()}
        >
          Check match
        </button>
        <button
          type="button"
          className={btnPrimary}
          disabled={busy || !linkedDivisionId || !linkName.trim()}
          onClick={() => void saveLink()}
        >
          {existing ? "Update link" : "Save link"}
        </button>
        {existing ? (
          <button
            type="button"
            className={btnDelete}
            disabled={busy}
            onClick={() => void unlink()}
          >
            Unlink
          </button>
        ) : null}
      </div>
    </div>
  );
}
