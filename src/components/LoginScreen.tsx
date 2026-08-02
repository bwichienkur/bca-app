"use client";

import { useState, type FormEvent } from "react";
import { LogIn } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";

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

const inputClass =
  "ui-focus w-full rounded-[var(--radius-sm)] border border-[var(--line)] bg-[color-mix(in_srgb,var(--surface-2)_90%,transparent)] px-4 py-3.5 text-[15px] text-[var(--ink)] outline-none transition placeholder:text-[var(--muted)]";

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
    <section className="animate-rise mx-auto max-w-lg">
      <PageHeader
        eyebrow="BCA / FargoRate"
        title="Sign in"
        description="Use the same email and password as the official BCAPL scoring app. Signing in unlocks Score and filters League · Division · My team to the teams you belong to."
      />

      <form
        onSubmit={onSubmit}
        className="ui-glass space-y-6 rounded-[var(--radius)] p-6 md:p-8"
      >
        <label className="block space-y-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
            Email
          </span>
          <input
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className={inputClass}
          />
          <p className="text-xs text-[var(--muted)]">
            The address tied to your LMS player account.
          </p>
        </label>

        <label className="block space-y-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
            Password
          </span>
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className={inputClass}
          />
        </label>

        {error ? (
          <p className="rounded-[var(--radius-sm)] border border-[color-mix(in_srgb,var(--danger)_35%,transparent)] bg-[var(--danger-bg)] px-4 py-3 text-sm text-[var(--danger)]">
            {error}
          </p>
        ) : null}

        <div className="space-y-3 pt-1">
          <Button type="submit" disabled={loggingIn} className="w-full">
            <LogIn className="h-4 w-4" aria-hidden />
            {loggingIn ? "Signing in…" : "Sign in"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={onCancel}
            className="w-full"
          >
            Cancel
          </Button>
        </div>
      </form>
    </section>
  );
}
