import Link from "next/link";

import { Brand } from "@/components/brand";

export default function LandingPage() {
  return (
    <main className="flex min-h-dvh flex-col px-5 py-5 sm:px-8 sm:py-7">
      <Brand />
      <section className="m-auto flex w-full max-w-sm flex-col items-center gap-8 py-16 text-center">
        <div className="space-y-3">
          <p className="font-mono text-xs font-semibold uppercase tracking-[0.22em] text-[var(--accent)]">
            Slides, simplified
          </p>
          <h1 className="text-4xl font-semibold tracking-[-0.045em] sm:text-5xl">
            Start with an idea.
          </h1>
        </div>
        <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
          <Link className="ui-button ui-button-secondary" href="/login">
            Log in
          </Link>
          <Link className="ui-button ui-button-primary" href="/register">
            Register
          </Link>
        </div>
      </section>
    </main>
  );
}
