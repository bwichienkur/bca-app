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
        className="w-full rounded-2xl border border-[var(--line)] bg-white/90 px-4 py-2.5 text-sm outline-none ring-[var(--felt-soft)] transition focus:ring-2"
      />
    </label>
  );
}
