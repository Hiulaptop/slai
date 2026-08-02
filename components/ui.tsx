import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";

export function Field({
  id,
  label,
  error,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  id: string;
  label: string;
  error?: string;
}) {
  const errorId = `${id}-error`;
  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium" htmlFor={id}>{label}</label>
      <input
        {...props}
        id={id}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
        className="h-12 w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3.5 text-base shadow-[0_1px_0_rgba(23,23,19,0.04)] placeholder:text-stone-400 hover:border-stone-400"
      />
      {error ? <p id={errorId} className="text-sm text-[var(--danger)]">{error}</p> : null}
    </div>
  );
}

export function Button({ className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={`ui-button ui-button-primary ${className}`} {...props} />;
}

export function StatusMessage({ children }: { children?: ReactNode }) {
  return (
    <p className="min-h-5 text-sm text-[var(--danger)]" role="status" aria-live="polite">
      {children}
    </p>
  );
}

export function FullPageLoader({ label = "Loading your workspace" }: { label?: string }) {
  return (
    <main className="grid min-h-dvh place-items-center px-5" role="status">
      <div className="flex items-center gap-3 text-sm text-[var(--muted)]">
        <span className="size-2 animate-pulse rounded-full bg-[var(--accent)]" aria-hidden="true" />
        {label}
      </div>
    </main>
  );
}
