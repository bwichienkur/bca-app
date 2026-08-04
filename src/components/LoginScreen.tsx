"use client";

import { useState, type FormEvent } from "react";

export type AuthUser = {
  lmsId: string;
  readableId: string | null;
  name: string | null;
  email: string | null;
};

type LoginScreenProps = {
  onSuccess: (user: AuthUser) => void;
  onCancel: () => void;
};

export function LoginScreen({ onSuccess, onCancel }: LoginScreenProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loggingIn, setLoggingIn] = useState(false);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setLoggingIn(true);
    setError(null);
    try {
      const response = await fetch("/api/scoring/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
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

  return (
    <section className="animate-rise mx-auto max-w-lg space-y-5">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--amber)]">
          BCA / FargoRate
        </p>
        <h2 className="mt-1 font-[family-name:var(--font-display)] text-3xl text-[var(--felt-deep)]">
          Sign in
        </h2>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Use the same email and password as the official BCAPL scoring app.
          Signing in unlocks Score and filters League · Division · My team to
          the teams you belong to.
        </p>
      </div>

      <form
        onSubmit={onSubmit}
        className="space-y-4 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] p-5 shadow-sm"
      >
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
            autoComplete="current-password"
            required
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
          {loggingIn ? "Signing in…" : "Sign in"}
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
