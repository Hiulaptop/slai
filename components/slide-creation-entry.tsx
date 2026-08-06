"use client";

import Link from "next/link";
import { useState } from "react";

import { DesignProjectSetup } from "@/components/design-project-setup";
import { SlideCreationWorkspace } from "@/components/slide-creation-workspace";

type CreationChoice = "chooser" | "design" | "report";

export function SlideCreationEntry() {
  const [choice, setChoice] = useState<CreationChoice>("chooser");

  if (choice === "report") return <SlideCreationWorkspace />;
  if (choice === "design") return <DesignProjectSetup onBack={() => setChoice("chooser")} />;

  return (
    <main className="mx-auto max-w-4xl px-5 py-8 sm:px-8 sm:py-12">
      <Link className="text-sm font-medium text-[var(--muted)] underline underline-offset-4" href="/home">
        Back to presentations
      </Link>

      <header className="mt-7 border-b border-[var(--line)] pb-8">
        <p className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-[var(--accent)]">Create</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.045em] sm:text-5xl">How do you want to start?</h1>
        <p className="mt-3 max-w-2xl leading-7 text-[var(--muted)]">
          Design your own slides from a blank canvas or a template, or bring source material and let SLAI generate a
          first draft you can refine.
        </p>
      </header>

      <div className="mt-8 grid gap-5 sm:grid-cols-2">
        <ChoiceCard
          eyebrow="Design first"
          title="Design from template or blank"
          description="Open the visual editor and place text, shapes, and images yourself. No AI generation, no report required."
          cta="Start designing"
          onSelect={() => setChoice("design")}
        />
        <ChoiceCard
          eyebrow="AI generated"
          title="Generate from report"
          description="Upload source material and a template; SLAI drafts an outline and a full deck you can review and edit."
          cta="Start from a report"
          onSelect={() => setChoice("report")}
        />
      </div>
    </main>
  );
}

function ChoiceCard({
  eyebrow,
  title,
  description,
  cta,
  onSelect,
}: {
  eyebrow: string;
  title: string;
  description: string;
  cta: string;
  onSelect(): void;
}) {
  return (
    <button
      className="flex flex-col items-start gap-4 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6 text-left transition-transform hover:-translate-y-0.5 hover:border-stone-400 hover:bg-white sm:p-8"
      onClick={onSelect}
      type="button"
    >
      <p className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">{eyebrow}</p>
      <h2 className="text-xl font-semibold tracking-[-0.03em]">{title}</h2>
      <p className="text-sm leading-6 text-[var(--muted)]">{description}</p>
      <span className="ui-button ui-button-primary mt-auto">{cta}</span>
    </button>
  );
}
