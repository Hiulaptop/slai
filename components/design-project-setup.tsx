"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { useAuth } from "@/lib/auth/auth-context";
import { Button, Field, StatusMessage } from "@/components/ui";
import type {
  ApiErrorBody,
  DesignBootstrapRequest,
  DesignBootstrapResponse,
  DesignMode,
  TemplateListResponse,
  TemplateSummary,
} from "@/lib/types";

type FieldErrors = Partial<Record<"title" | "templateId" | "slideCount", string>>;
type TemplateLoadState = "idle" | "loading" | "ready" | "error";

export function DesignProjectSetup({ onBack }: { onBack(): void }) {
  const { authFetch } = useAuth();
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [mode, setMode] = useState<DesignMode>("blank");
  const [slideCount, setSlideCount] = useState("1");
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [templateState, setTemplateState] = useState<TemplateLoadState>("idle");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [requestError, setRequestError] = useState("");
  const [pending, setPending] = useState(false);

  function selectMode(next: DesignMode) {
    setMode(next);
    setErrors({});
    if (next !== "template" || templateState !== "idle") return;

    setTemplateState("loading");
    void authFetch("/api/templates")
      .then(async (response) => {
        if (!response.ok) throw new Error("templates request failed");
        return response.json() as Promise<TemplateListResponse>;
      })
      .then((body) => {
        setTemplates(body.items ?? []);
        setTemplateState("ready");
      })
      .catch(() => setTemplateState("error"));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    const fieldErrors: FieldErrors = {};
    if (!title.trim()) fieldErrors.title = "Enter a project title.";
    const count = Number(slideCount);
    if (mode === "blank" && (!slideCount || !Number.isInteger(count) || count < 1 || count > 50)) {
      fieldErrors.slideCount = "Enter a whole number of slides between 1 and 50.";
    }
    if (mode === "template" && !templateId) fieldErrors.templateId = "Choose a template.";
    setErrors(fieldErrors);
    setRequestError("");
    if (Object.keys(fieldErrors).length) return;

    const body: DesignBootstrapRequest = { title: title.trim(), mode };
    if (mode === "blank") body.slideCount = count;
    if (mode === "template") body.templateId = templateId;

    setPending(true);
    try {
      const response = await authFetch("/api/slides/design/bootstrap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error(await responseError(response, "We could not start this design project."));
      const result = (await response.json()) as DesignBootstrapResponse;
      if (!result.id) throw new Error("The bootstrap response did not include an ID.");
      router.push(`/slides/${result.id}/design`);
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : "We could not start this design project.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="mt-8 max-w-2xl" onSubmit={submit} noValidate>
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-[var(--muted)]">Design project</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em]">Start from a blank canvas or a template</h2>
        </div>
        <button className="ui-button ui-button-secondary" disabled={pending} onClick={onBack} type="button">
          Back
        </button>
      </div>

      <div className="mt-6 space-y-6 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 sm:p-8">
        <Field
          id="design-title"
          label="Project title"
          value={title}
          error={errors.title}
          onChange={(event) => {
            setTitle(event.target.value);
            setErrors((current) => ({ ...current, title: undefined }));
          }}
          placeholder="Investor update"
        />

        <fieldset className="space-y-3">
          <legend className="text-sm font-medium">Starting point</legend>
          <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Starting point">
            <ModeOption active={mode === "blank"} label="Blank project" hint="Start with empty slides and design freely." onSelect={() => selectMode("blank")} />
            <ModeOption active={mode === "template"} label="From a template" hint="Seed slides from one of your owned templates." onSelect={() => selectMode("template")} />
          </div>
        </fieldset>

        {mode === "blank" ? (
          <Field
            id="slide-count"
            label="Number of slides"
            type="number"
            inputMode="numeric"
            min="1"
            max="50"
            step="1"
            value={slideCount}
            error={errors.slideCount}
            onChange={(event) => {
              setSlideCount(event.target.value);
              setErrors((current) => ({ ...current, slideCount: undefined }));
            }}
          />
        ) : (
          <div>
            <p className="text-sm font-medium">Template</p>
            {templateState === "loading" ? <p className="mt-2 text-sm text-[var(--muted)]" role="status">Loading your templates...</p> : null}
            {templateState === "error" ? <p className="mt-2 text-sm text-[var(--danger)]" role="alert">Templates could not be loaded.</p> : null}
            {templateState === "ready" && templates.length === 0 ? (
              <p className="mt-2 text-sm text-[var(--muted)]">You do not have any saved templates yet.</p>
            ) : null}
            {templateState === "ready" && templates.length > 0 ? (
              <ul className="mt-3 space-y-2" aria-label="Owned templates" role="radiogroup">
                {templates.map((template) => (
                  <li key={template.id}>
                    <button
                      aria-pressed={templateId === template.id}
                      className={`w-full rounded-xl border px-4 py-3 text-left text-sm ${templateId === template.id ? "border-[var(--accent)] bg-blue-50" : "border-[var(--line)] bg-white"}`}
                      onClick={() => {
                        setTemplateId(template.id);
                        setErrors((current) => ({ ...current, templateId: undefined }));
                      }}
                      type="button"
                    >
                      {template.name}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            {errors.templateId ? <p className="mt-2 text-sm text-[var(--danger)]">{errors.templateId}</p> : null}
          </div>
        )}
      </div>

      <div className="mt-6 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <StatusMessage>{requestError}</StatusMessage>
        <Button className="min-w-48" disabled={pending} type="submit">
          {pending ? "Creating project..." : requestError ? "Retry" : "Open design editor"}
        </Button>
      </div>
    </form>
  );
}

function ModeOption({ active, label, hint, onSelect }: { active: boolean; label: string; hint: string; onSelect(): void }) {
  return (
    <button
      aria-checked={active}
      className={`rounded-xl border p-4 text-left ${active ? "border-[var(--accent)] bg-blue-50" : "border-[var(--line)] bg-white"}`}
      onClick={onSelect}
      role="radio"
      type="button"
    >
      <span className="block font-semibold">{label}</span>
      <span className="mt-1 block text-sm text-[var(--muted)]">{hint}</span>
    </button>
  );
}

async function responseError(response: Response, fallback: string) {
  try {
    const body = (await response.json()) as ApiErrorBody;
    return body.error?.message || fallback;
  } catch {
    return fallback;
  }
}
