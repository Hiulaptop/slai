import Link from "next/link";

export function Brand({ href = "/" }: { href?: string }) {
  return (
    <Link
      href={href}
      className="inline-flex w-fit items-center gap-2.5 rounded-md font-semibold tracking-[-0.03em]"
      aria-label="SLAI home"
    >
      <span className="grid size-8 place-items-center rounded-lg bg-[var(--ink)] font-mono text-xs text-white">
        S
      </span>
      <span className="text-lg">SLAI</span>
    </Link>
  );
}
