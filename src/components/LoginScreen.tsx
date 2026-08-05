"use client";

import { useState, type FormEvent } from "react";

export type AuthUser = {
  id: string;
  lmsId: string;
  readableId: string | null;
  name: string | null;
  email: string | null;
  fargoLinked?: boolean;
  digitalPoolLinked?: boolean;
  scoringReady?: boolean;
};

type Mode = "app-login" | "app-register" | "fargo";

type LoginScreenProps = {
  onSuccess: (user: AuthUser) => void;
  onCancel: () => void;
};

export function LoginScreen({ onSuccess, onCancel }: LoginScreenProps) {
  const [mode, setMode] = useState<Mode>("app-login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loggingIn, setLoggingIn] = useState(false);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setLoggingIn(true);
    setError(null);
    try {
      const endpoint =
        mode === "app-register"
          ? "/api/auth/register"
          : mode === "app-login"
            ? "/api/auth/login"
            : "/api/scoring/login";
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          ...(mode === "app-register" && name.trim()
            ? { name: name.trim() }
            : {}),
        }),
      });
      const payload = (await response.json().catch(() => null)) as {
        user?: AuthUser;
        error?: string;
      } | null;
      if (!response.ok || !payload?.user) {
        throw new Error(payload?.error || "Login failed.");
      }
      onSuccess(payload.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed.");
    } finally {
      setLoggingIn(false);
    }
  };

  const title =
    mode === "app-register"
      ? "Create account"
      : mode === "fargo"
        ? "FargoRate / Score"
        : "Sign in";

  const subtitle =
    mode === "app-register"
      ? "Your Tableside account is for Events, settings, and linked services. Connect FargoRate for Score and Digital Pool for brackets."
      : mode === "fargo"
        ? "Use the same email and password as the official BCAPL scoring app. This also creates or links your Tableside account."
        : "Sign in with your Tableside account. Connect FargoRate in Settings when you need Score.";

  return (
    <section className="animate-rise mx-auto max-w-lg space-y-5">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--amber)]">
          Tableside
        </p>
        <h2 className="mt-1 font-[family-name:var(--font-display)] text-3xl text-[var(--felt-deep)]">
          {title}
        </h2>
        <p className="mt-2 text-sm text-[var(--muted)]">{subtitle}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {(
          [
            ["app-login", "Tableside"],
            ["app-register", "Create account"],
            ["fargo", "FargoRate"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => {
              setMode(value);
              setError(null);
            }}
            className={[
              "rounded-full px-3 py-1.5 text-xs font-semibold transition",
              mode === value
                ? "bg-[var(--felt)] text-white"
                : "border border-[var(--line)] bg-[var(--surface-2)] text-[var(--muted)]",
            ].join(" ")}
          >
            {label}
          </button>
        ))}
      </div>

      <form
        onSubmit={onSubmit}
        className="space-y-4 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] p-5 shadow-sm"
      >
        {mode === "app-register" ? (
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
              Name
            </span>
            <input
              type="text"
              autoComplete="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="w-full rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-2)] px-3.5 py-3 outline-none ring-[var(--felt)] focus:ring-2"
              placeholder="Optional"
            />
          </label>
        ) : null}
        <label className="block space-y-1.5">
          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
            Email
          </span>
          <input
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="w-full rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-2)] px-3.5 py-3 outline-none ring-[var(--felt)] focus:ring-2"
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
            Password
          </span>
          <input
            type="password"
            autoComplete={
              mode === "app-register" ? "new-password" : "current-password"
            }
            required
            minLength={mode === "fargo" ? 6 : 8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="w-full rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-2)] px-3.5 py-3 outline-none ring-[var(--felt)] focus:ring-2"
          />
        </label>
        {error ? (
          <p className="rounded-[var(--radius)] border border-[var(--danger)]/30 bg-[var(--danger-bg)] px-3 py-2 text-sm text-[var(--danger)]">
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={loggingIn}
          className="w-full rounded-[var(--radius)] bg-[var(--felt)] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[var(--felt-soft)] disabled:opacity-60"
        >
          {loggingIn
            ? mode === "app-register"
              ? "Creating…"
              : "Signing in…"
            : mode === "app-register"
              ? "Create account"
              : mode === "fargo"
                ? "Sign in with FargoRate"
                : "Sign in"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="w-full rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-2)] px-4 py-3 text-sm font-semibold text-[var(--muted)]"
        >
          Cancel
        </button>
      </form>
    </section>
  );
}
