"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ChangeEvent, type FormEvent, type InputHTMLAttributes, type TextareaHTMLAttributes } from "react";

import { useAuth } from "@/lib/auth/auth-context";
import type { ApiErrorBody, SlideCreationInputs, SlideCreationPhase, SlideOutline } from "@/lib/types";

const MEBIBYTE = 1024 * 1024;
const MAX_FILE_BYTES = 10 * MEBIBYTE;
const MAX_UPLOAD_BYTES = 100 * MEBIBYTE;
const DATA_TYPES = new Set([
  "application/pdf",
  "text/plain",
  "text/markdown",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.oasis.opendocument.text",
]);
const TEMPLATE_TYPES = new Set(["text/html", "application/pdf", "image/png", "image/jpeg", "image/webp"]);
const MEDIA_TYPES_BY_EXTENSION: Record<string, string> = {
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".html": "text/html",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".md": "text/markdown",
  ".odt": "application/vnd.oasis.opendocument.text",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".txt": "text/plain",
  ".webp": "image/webp",
};

type InputErrors = Partial<Record<"title" | "slideCount" | "prompt" | "dataFiles" | "templateFiles" | "files", string>>;
type FileGroup = "dataFiles" | "templateFiles";

const initialInputs: SlideCreationInputs = {
  title: "",
  slideCount: "",
  prompt: "",
  dataFiles: [],
  templateFiles: [],
};

export function SlideCreationWorkspace() {
  const { authFetch } = useAuth();
  const router = useRouter();
  const [phase, setPhase] = useState<SlideCreationPhase>("inputs");
  const [inputs, setInputs] = useState<SlideCreationInputs>(initialInputs);
  const [outline, setOutline] = useState<SlideOutline | null>(null);
  const [inputErrors, setInputErrors] = useState<InputErrors>({});
  const [outlineErrors, setOutlineErrors] = useState<Record<string, string>>({});
  const [requestError, setRequestError] = useState("");
  const [outlinePending, setOutlinePending] = useState(false);

  function updateInput(field: "title" | "slideCount" | "prompt", value: string) {
    setInputs((current) => ({ ...current, [field]: value }));
    setInputErrors((current) => ({ ...current, [field]: undefined }));
  }

  function selectFiles(group: FileGroup, event: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!selected.length) return;

    const allowed = group === "dataFiles" ? DATA_TYPES : TEMPLATE_TYPES;
    const label = group === "dataFiles" ? "data" : "template";
    const invalid = selected.find((file) => !file.name.trim() || file.size < 1 || file.size > MAX_FILE_BYTES || !allowed.has(normalizedMediaType(file)));
    if (invalid) {
      setInputErrors((current) => ({
        ...current,
        [group]: `${invalid.name || "Selected file"} must be a supported, non-empty ${label} file no larger than 10 MiB.`,
      }));
      return;
    }

    const nextInputs = { ...inputs, [group]: [...inputs[group], ...selected] };
    if (totalBytes(nextInputs) > MAX_UPLOAD_BYTES) {
      setInputErrors((current) => ({ ...current, files: "Selected files exceed the 100 MiB aggregate upload limit." }));
      return;
    }

    setInputs(nextInputs);
    setInputErrors((current) => ({ ...current, [group]: undefined, files: undefined }));
  }

  function removeFile(group: FileGroup, index: number) {
    setInputs((current) => ({ ...current, [group]: current[group].filter((_, fileIndex) => fileIndex !== index) }));
    setInputErrors((current) => ({ ...current, [group]: undefined, files: undefined }));
  }

  async function requestOutline(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (outlinePending) return;
    const errors = validateInputs(inputs);
    setInputErrors(errors);
    setRequestError("");
    if (Object.keys(errors).length) return;

    setOutlinePending(true);
    try {
      const response = await authFetch("/api/slides/outline", { method: "POST", body: creationFormData(inputs, false) });
      if (!response.ok) throw new Error(await responseError(response, "We could not create an outline."));
      const body = await response.json() as { outline?: SlideOutline };
      if (!body.outline || !validOutline(body.outline, Number(inputs.slideCount))) {
        throw new Error("The outline response was incomplete. Please try again.");
      }
      setOutline(body.outline);
      setOutlineErrors({});
      setPhase("outline");
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : "We could not create an outline.");
    } finally {
      setOutlinePending(false);
    }
  }

  function updateOutlineTitle(value: string) {
    setOutline((current) => current ? { ...current, title: value } : current);
    setOutlineErrors((current) => ({ ...current, title: "" }));
  }

  function updateSlide(index: number, field: "title" | "summary", value: string) {
    setOutline((current) => current ? {
      ...current,
      slides: current.slides.map((slide, slideIndex) => slideIndex === index ? { ...slide, [field]: value } : slide),
    } : current);
    setOutlineErrors((current) => ({ ...current, [`slides.${index}.${field}`]: "" }));
  }

  async function generatePresentation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!outline || phase === "generating") return;
    const errors = validateOutline(outline, Number(inputs.slideCount));
    setOutlineErrors(errors);
    setRequestError("");
    if (Object.keys(errors).length) return;

    setPhase("generating");
    const form = creationFormData(inputs);
    form.set("outline", JSON.stringify(outline));
    try {
      const response = await authFetch("/api/slides/generate", { method: "POST", body: form });
      if (!response.ok) throw new Error(await responseError(response, "We could not generate the presentation."));
      const body = await response.json() as { id?: string; generationId?: string };
      const generationId = body.generationId ?? body.id;
      if (!generationId) throw new Error("The presentation response did not include an ID.");
      router.push(`/slides/${generationId}`);
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : "We could not generate the presentation.");
      setPhase("outline");
    }
  }

  const aggregateSize = totalBytes(inputs);

  return (
    <main className="mx-auto max-w-6xl px-5 py-8 sm:px-8 sm:py-12">
      <Link className="text-sm font-medium text-[var(--muted)] underline underline-offset-4" href="/home">Back to presentations</Link>

      <header className="mt-7 grid gap-6 border-b border-[var(--line)] pb-8 lg:grid-cols-[1fr_auto] lg:items-end">
        <div>
          <p className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-[var(--accent)]">Creation studio</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.045em] sm:text-5xl">Build a presentation</h1>
          <p className="mt-3 max-w-2xl leading-7 text-[var(--muted)]">Bring the source material and visual references. Review the story before the deck is generated.</p>
        </div>
        <ol className="flex gap-2 text-xs font-medium" aria-label="Creation progress">
          <PhaseStep active={phase === "inputs"} complete={phase !== "inputs"} number="01" label="Inputs" />
          <PhaseStep active={phase === "outline"} complete={phase === "generating"} number="02" label="Outline" />
          <PhaseStep active={phase === "generating"} complete={false} number="03" label="Generate" />
        </ol>
      </header>

      {phase === "inputs" ? (
        <form className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.55fr)]" onSubmit={requestOutline} noValidate>
          <section className="space-y-6 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 sm:p-8" aria-labelledby="presentation-details">
            <div><p className="font-mono text-xs uppercase tracking-[0.18em] text-[var(--muted)]">01 / Story</p><h2 id="presentation-details" className="mt-2 text-xl font-semibold">Presentation details</h2></div>
            <TextField id="title" label="Presentation title" value={inputs.title} error={inputErrors.title} onChange={(value) => updateInput("title", value)} placeholder="Quarterly product review" />
            <TextField id="slide-count" label="Number of slides" value={inputs.slideCount} error={inputErrors.slideCount} onChange={(value) => updateInput("slideCount", value)} type="number" inputMode="numeric" min="1" step="1" placeholder="12" />
            <TextAreaField id="prompt" label="What should the presentation accomplish?" value={inputs.prompt} error={inputErrors.prompt} onChange={(value) => updateInput("prompt", value)} placeholder="Explain the strongest trends, risks, and decisions for the leadership team." />
          </section>

          <section className="space-y-6 rounded-2xl border border-[var(--line)] bg-stone-900 p-5 text-stone-50 sm:p-8" aria-labelledby="source-files">
            <div><p className="font-mono text-xs uppercase tracking-[0.18em] text-blue-300">02 / Material</p><h2 id="source-files" className="mt-2 text-xl font-semibold">Source files</h2></div>
            <FilePicker group="dataFiles" label="Data files" hint="PDF, TXT, Markdown, DOCX, or ODT" files={inputs.dataFiles} error={inputErrors.dataFiles} onSelect={selectFiles} onRemove={removeFile} accept=".pdf,.txt,.md,.docx,.odt" />
            <FilePicker group="templateFiles" label="Template files" hint="HTML, PDF, PNG, JPEG, or WebP" files={inputs.templateFiles} error={inputErrors.templateFiles} onSelect={selectFiles} onRemove={removeFile} accept=".html,.pdf,.png,.jpg,.jpeg,.webp" />
            <div className="border-t border-stone-700 pt-4 text-xs text-stone-300">
              <div className="flex justify-between gap-4"><span>Aggregate upload</span><span>{formatBytes(aggregateSize)} / 100 MiB</span></div>
              {inputErrors.files ? <p className="mt-2 text-red-300" role="alert">{inputErrors.files}</p> : null}
            </div>
          </section>

          <div className="lg:col-span-2 flex flex-col items-start justify-between gap-4 border-t border-[var(--line)] pt-6 sm:flex-row sm:items-center">
            <RequestError message={requestError} />
            <button className="ui-button ui-button-primary min-w-44" type="submit" disabled={outlinePending}>{outlinePending ? "Creating outline..." : requestError ? "Retry outline" : "Review outline"}</button>
          </div>
        </form>
      ) : outline ? (
        <form className="mt-8" onSubmit={generatePresentation} noValidate>
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div><p className="font-mono text-xs uppercase tracking-[0.18em] text-[var(--muted)]">Review before generation</p><h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em]">Shape the narrative</h2></div>
            <button className="ui-button ui-button-secondary" type="button" disabled={phase === "generating"} onClick={() => { setPhase("inputs"); setRequestError(""); }}>Back to inputs</button>
          </div>

          <div className="mt-6 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 sm:p-7">
            <TextField id="outline-title" label="Outline title" value={outline.title} error={outlineErrors.title} onChange={updateOutlineTitle} />
          </div>

          <section className="mt-4 grid gap-4 lg:grid-cols-2" aria-label="Outline slides">
            {outline.slides.map((slide, index) => (
              <article className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 sm:p-6" key={slide.number}>
                <p className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">Slide {index + 1}</p>
                <div className="mt-4 space-y-4">
                  <TextField id={`slide-${index + 1}-title`} label={`Slide ${index + 1} title`} value={slide.title} error={outlineErrors[`slides.${index}.title`]} onChange={(value) => updateSlide(index, "title", value)} />
                  <TextAreaField id={`slide-${index + 1}-summary`} label={`Slide ${index + 1} summary`} value={slide.summary} error={outlineErrors[`slides.${index}.summary`]} onChange={(value) => updateSlide(index, "summary", value)} rows={4} />
                </div>
              </article>
            ))}
          </section>

          <div className="mt-6 flex flex-col items-start justify-between gap-4 border-t border-[var(--line)] pt-6 sm:flex-row sm:items-center">
            <RequestError message={requestError} />
            <button className="ui-button ui-button-primary min-w-52" type="submit" disabled={phase === "generating"}>{phase === "generating" ? "Generating your deck..." : requestError ? "Retry generation" : "Generate presentation"}</button>
          </div>
          {phase === "generating" ? <p className="mt-3 text-right text-sm text-[var(--muted)]" role="status">The provider is building and validating every slide. This may take a few minutes.</p> : null}
        </form>
      ) : null}
    </main>
  );
}

function PhaseStep({ active, complete, number, label }: { active: boolean; complete: boolean; number: string; label: string }) {
  return <li className={`rounded-full border px-3 py-2 ${active ? "border-[var(--accent)] bg-[var(--accent)] text-white" : complete ? "border-[var(--accent)] text-[var(--accent)]" : "border-[var(--line)] text-[var(--muted)]"}`} aria-current={active ? "step" : undefined}>{number} {label}</li>;
}

function TextField({ id, label, value, error, onChange, ...props }: { id: string; label: string; value: string; error?: string; onChange(value: string): void } & Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "value" | "onChange">) {
  const errorId = `${id}-error`;
  return <div className="space-y-2"><label className="block text-sm font-medium" htmlFor={id}>{label}</label><input {...props} id={id} value={value} onChange={(event) => onChange(event.target.value)} aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined} className="h-12 w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3.5 text-base shadow-[0_1px_0_rgba(23,23,19,0.04)] placeholder:text-stone-400" />{error ? <p id={errorId} className="text-sm text-[var(--danger)]">{error}</p> : null}</div>;
}

function TextAreaField({ id, label, value, error, onChange, ...props }: { id: string; label: string; value: string; error?: string; onChange(value: string): void } & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "id" | "value" | "onChange">) {
  const errorId = `${id}-error`;
  return <div className="space-y-2"><label className="block text-sm font-medium" htmlFor={id}>{label}</label><textarea {...props} id={id} value={value} onChange={(event) => onChange(event.target.value)} aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined} rows={props.rows ?? 6} className="w-full resize-y rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3.5 py-3 text-base leading-6 shadow-[0_1px_0_rgba(23,23,19,0.04)] placeholder:text-stone-400" />{error ? <p id={errorId} className="text-sm text-[var(--danger)]">{error}</p> : null}</div>;
}

function FilePicker({ group, label, hint, files, error, accept, onSelect, onRemove }: { group: FileGroup; label: string; hint: string; files: File[]; error?: string; accept: string; onSelect(group: FileGroup, event: ChangeEvent<HTMLInputElement>): void; onRemove(group: FileGroup, index: number): void }) {
  const id = `${group}-input`;
  return <div><div className="flex items-baseline justify-between gap-3"><label className="text-sm font-medium" htmlFor={id}>{label}</label><span className="text-xs text-stone-400">10 MiB each</span></div><p className="mt-1 text-xs text-stone-400">{hint}</p><input className="mt-3 block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-stone-50 file:px-3 file:py-2 file:font-medium file:text-stone-900" id={id} type="file" multiple accept={accept} onChange={(event) => onSelect(group, event)} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} />{error ? <p id={`${id}-error`} className="mt-2 text-sm text-red-300" role="alert">{error}</p> : null}{files.length ? <ul className="mt-3 space-y-2" aria-label={`Selected ${label.toLowerCase()}`}>{files.map((file, index) => <li className="flex items-center justify-between gap-3 rounded-lg bg-stone-800 px-3 py-2 text-sm" key={`${file.name}-${file.lastModified}-${index}`}><span className="min-w-0 truncate">{file.name} <span className="text-stone-400">({formatBytes(file.size)})</span></span><button className="shrink-0 text-xs font-medium underline underline-offset-4" type="button" onClick={() => onRemove(group, index)} aria-label={`Remove ${file.name}`}>Remove</button></li>)}</ul> : null}</div>;
}

function RequestError({ message }: { message: string }) {
  return <p className="min-h-5 text-sm text-[var(--danger)]" role="alert" aria-live="polite">{message}</p>;
}

function validateInputs(inputs: SlideCreationInputs): InputErrors {
  const errors: InputErrors = {};
  const count = Number(inputs.slideCount);
  if (!inputs.title.trim()) errors.title = "Enter a presentation title.";
  if (!inputs.slideCount || !Number.isInteger(count) || count < 1) errors.slideCount = "Enter a positive whole number of slides.";
  if (!inputs.prompt.trim()) errors.prompt = "Describe what the presentation should accomplish.";
  if (!inputs.dataFiles.length) errors.dataFiles = "Add at least one data file.";
  if (!inputs.templateFiles.length) errors.templateFiles = "Add at least one template file.";
  if (totalBytes(inputs) > MAX_UPLOAD_BYTES) errors.files = "Selected files exceed the 100 MiB aggregate upload limit.";
  return errors;
}

function validateOutline(outline: SlideOutline, slideCount: number): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!outline.title.trim()) errors.title = "Enter an outline title.";
  if (outline.slides.length !== slideCount) errors.slides = "The outline must contain the requested number of slides.";
  outline.slides.forEach((slide, index) => {
    if (slide.number !== index + 1) errors[`slides.${index}.number`] = "Slide numbering must be contiguous.";
    if (!slide.title.trim()) errors[`slides.${index}.title`] = "Enter a slide title.";
    if (!slide.summary.trim()) errors[`slides.${index}.summary`] = "Enter a slide summary.";
  });
  return errors;
}

function validOutline(outline: SlideOutline, slideCount: number) {
  return typeof outline.title === "string" && Array.isArray(outline.slides) && outline.slides.length === slideCount && outline.slides.every((slide, index) => slide.number === index + 1 && typeof slide.title === "string" && typeof slide.summary === "string");
}

function creationFormData(inputs: SlideCreationInputs, includeTemplates = true) {
  const form = new FormData();
  form.set("title", inputs.title.trim());
  form.set("slideCount", inputs.slideCount);
  form.set("prompt", inputs.prompt.trim());
  inputs.dataFiles.forEach((file) => form.append("dataFiles", file));
  if (includeTemplates) inputs.templateFiles.forEach((file) => form.append("templateFiles", file));
  return form;
}

async function responseError(response: Response, fallback: string) {
  try {
    const body = await response.json() as ApiErrorBody;
    return body.error?.message || fallback;
  } catch {
    return fallback;
  }
}

function totalBytes(inputs: SlideCreationInputs) {
  return [...inputs.dataFiles, ...inputs.templateFiles].reduce((total, file) => total + file.size, 0);
}

function normalizedMediaType(file: File) {
  const extension = file.name.toLowerCase().match(/\.[^.]+$/)?.[0];
  const supplied = file.type.toLowerCase().split(";", 1)[0].trim();
  if (supplied && supplied !== "application/octet-stream") return supplied;
  return extension ? MEDIA_TYPES_BY_EXTENSION[extension] ?? supplied : supplied;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < MEBIBYTE) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / MEBIBYTE).toFixed(1)} MiB`;
}
