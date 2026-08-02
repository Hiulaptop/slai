import type { ReactNode } from "react";

import { Brand } from "./brand";

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <main className="grid min-h-dvh lg:grid-cols-[minmax(280px,0.8fr)_1.2fr]">
      <aside className="hidden border-r border-[var(--line)] p-8 lg:flex lg:flex-col lg:justify-between">
        <Brand />
        <p className="max-w-xs text-3xl font-medium tracking-[-0.04em]">
          A quieter way to build presentations.
        </p>
      </aside>
      <section className="flex min-h-dvh flex-col px-5 py-6 sm:px-8">
        <div className="lg:hidden"><Brand /></div>
        <div className="my-auto mx-auto w-full max-w-md py-12">{children}</div>
      </section>
    </main>
  );
}
