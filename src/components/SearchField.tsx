"use client";

type SearchFieldProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
};

export function SearchField({
  value,
  onChange,
  placeholder = "Filter…",
  label = "Search",
}: SearchFieldProps) {
  return (
    <label className="block w-full max-w-md">
      <span className="sr-only">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full rounded-2xl border border-[var(--line)] bg-[var(--surface-2)] px-4 py-2.5 text-sm text-[var(--ink)] outline-none ring-[var(--felt-soft)] transition placeholder:text-[var(--muted)] focus:ring-2"
      />
    </label>
  );
}
