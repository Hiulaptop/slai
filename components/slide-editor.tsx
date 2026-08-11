"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { useAuth } from "@/lib/auth/auth-context";
import { renderStructuredRevision } from "@/modules/slides/domain/structured/render";
import type { ApiErrorBody, PresentationDetail, SlideDocument, SlideEdit } from "@/lib/types";

type LoadState = "loading" | "ready" | "not-found" | "error";
type Mutation = "edit" | "undo" | null;

export function SlideEditor({ generationId }: { generationId: string }) {
  const { authFetch } = useAuth();
  const [detail, setDetail] = useState<PresentationDetail | null>(null);
  const [slides, setSlides] = useState<SlideDocument[]>([]);
  const [selectedNumber, setSelectedNumber] = useState(1);
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [loadError, setLoadError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [mutation, setMutation] = useState<Mutation>(null);
  const [mutationError, setMutationError] = useState("");
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    let active = true;

    void loadDetail(authFetch, generationId).then((result) => {
      if (!active) return;
      if (result.kind === "not-found") {
        setLoadState("not-found");
        return;
      }
      if (result.kind === "error") {
        setLoadError(result.message);
        setLoadState("error");
        return;
      }
      applyDetail(result.detail, setDetail, setSlides, setSelectedNumber);
      setLoadState("ready");
    });

    return () => { active = false; };
  }, [authFetch, generationId, reloadKey]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      if (mutation || isTextEntryTarget(event.target)) return;
      if (!slides.length) return;
      const index = slides.findIndex((slide) => slide.number === selectedNumber);
      const nextIndex = event.key === "ArrowLeft" ? index - 1 : index + 1;
      if (nextIndex < 0 || nextIndex >= slides.length) return;
      event.preventDefault();
      setSelectedNumber(slides[nextIndex].number);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mutation, selectedNumber, slides]);

  function retryLoad() {
    setLoadState("loading");
    setLoadError("");
    setReloadKey((key) => key + 1);
  }

  async function sendFeedback() {
    const edits: SlideEdit[] = Object.entries(drafts)
      .map(([slideNumber, prompt]) => ({ slideNumber: Number(slideNumber), prompt: prompt.trim() }))
      .filter((edit) => edit.prompt.length > 0)
      .sort((left, right) => left.slideNumber - right.slideNumber);

    if (!edits.length) {
      setMutationError("Enter feedback for at least one slide.");
      return;
    }

    setMutation("edit");
    setMutationError("");
    try {
      const response = await authFetch("/api/slides/edit", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ generationId, edits }),
      });
      if (!response.ok) throw new Error(await responseMessage(response, "Feedback could not be applied."));
      const updated = await response.json() as PresentationDetail;
      applyDetail(updated, setDetail, setSlides, setSelectedNumber);
      setDrafts((current) => {
        const next = { ...current };
        edits.forEach(({ slideNumber }) => { delete next[slideNumber]; });
        return next;
      });
    } catch (error) {
      setMutationError(error instanceof Error ? error.message : "Feedback could not be applied.");
    } finally {
      setMutation(null);
    }
  }

  async function undoSlide() {
    const slideNumber = selectedNumber;
    setMutation("undo");
    setMutationError("");
    try {
      const response = await authFetch(`/api/slides/${generationId}/undo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slideNumber }),
      });
      if (!response.ok) throw new Error(await responseMessage(response, "This slide could not be undone."));
      const updated = await response.json() as PresentationDetail;
      applyDetail(updated, setDetail, setSlides, setSelectedNumber);
    } catch (error) {
      setMutationError(error instanceof Error ? error.message : "This slide could not be undone.");
    } finally {
      setMutation(null);
    }
  }

  async function downloadHtml() {
    if (!detail) return;
    setDownloading(true);
    try {
      const response = await authFetch(`/api/slides/${generationId}/download`);
      if (!response.ok) throw new Error(await responseMessage(response, "This deck could not be downloaded."));
      const html = await response.text();
      const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${downloadName(detail.title)}.html`;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch (error) {
      setMutationError(error instanceof Error ? error.message : "This deck could not be downloaded.");
    } finally {
      setDownloading(false);
    }
  }

  if (loadState === "loading") return <EditorState title="Loading presentation" message="Preparing the editor..." busy />;
  if (loadState === "not-found") return <EditorState title="Presentation not found" message="This presentation is unavailable or you do not have access to it." />;
  if (loadState === "error") return <EditorState title="Presentation unavailable" message={loadError} action={<button className="ui-button ui-button-primary" type="button" onClick={retryLoad}>Retry</button>} />;
  if (!detail) return null;

  if (detail.status !== "COMPLETED") {
    const failed = detail.status === "FAILED";
    return (
      <EditorState
        title={failed ? "Generation failed" : "Presentation is still being generated"}
        message={failed ? "No presentation is available. Return to your library or try creating the presentation again." : "The presentation is not ready yet. Refresh its details to check again."}
        action={!failed ? <button className="ui-button ui-button-primary" type="button" onClick={retryLoad}>Refresh details</button> : undefined}
      />
    );
  }

  if (!slides.length) return <EditorState title="Presentation unavailable" message="The completed presentation does not contain any readable slides." action={<button className="ui-button ui-button-primary" type="button" onClick={retryLoad}>Retry</button>} />;

  const selectedIndex = Math.max(0, slides.findIndex((slide) => slide.number === selectedNumber));
  const selected = slides[selectedIndex];
  const editing = mutation === "edit";
  const mutating = mutation !== null;
  const undoAvailable = detail.undoableSlideNumbers.includes(selected.number);
  const srcDoc = renderStructuredRevision({ animationRegistryVersion: detail.document?.animationRegistryVersion ?? 1, slides: [selected] });

  return (
    <main className="mx-auto max-w-[94rem] px-4 py-7 sm:px-7 sm:py-10">
      <header className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <Link className="font-mono text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent)]" href="/home">Back to presentations</Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-[-0.04em] sm:text-3xl">{detail.title?.trim() || "Untitled presentation"}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-3 sm:justify-end">
          <p className="text-sm text-[var(--muted)]">Slide {selectedIndex + 1} of {slides.length} · Revision {detail.revisionNumber ?? "-"}</p>
          <button className="ui-button ui-button-secondary" disabled={mutating || downloading} onClick={() => void downloadHtml()} type="button">{downloading ? "Preparing..." : "Download HTML"}</button>
        </div>
      </header>

      <div className="grid gap-5 lg:grid-cols-[13rem_minmax(0,1fr)]">
        <nav className="order-2 flex gap-2 overflow-x-auto pb-2 lg:order-1 lg:max-h-[68vh] lg:flex-col lg:overflow-y-auto" aria-label="Slide thumbnails">
          {slides.map((slide, index) => (
            <button
              aria-current={slide.number === selected.number ? "page" : undefined}
              aria-label={`Select slide ${slide.number}`}
              className={`min-w-28 rounded-xl border p-3 text-left text-sm ${slide.number === selected.number ? "border-[var(--accent)] bg-blue-50 text-[var(--accent)]" : "border-[var(--line)] bg-[var(--surface)]"}`}
              disabled={editing}
              key={slide.number}
              onClick={() => setSelectedNumber(slide.number)}
              type="button"
            >
              <span className="font-mono text-xs">{String(index + 1).padStart(2, "0")}</span>
              <span className="mt-1 block truncate">{detail.outline?.slides[index]?.title || `Slide ${slide.number}`}</span>
              {drafts[slide.number]?.trim() ? <span className="mt-2 block text-[10px] uppercase tracking-wide">Draft saved</span> : null}
            </button>
          ))}
        </nav>

        <section className="order-1 min-w-0 lg:order-2">
          <div className="overflow-hidden rounded-2xl border border-[var(--line)] bg-neutral-900 shadow-[0_18px_50px_rgba(23,23,19,0.16)]">
            <iframe
              className="aspect-video w-full bg-white"
              sandbox="allow-same-origin"
              srcDoc={srcDoc}
              title={`Slide ${selected.number} preview`}
            />
          </div>
          <div className="mt-4 flex items-center justify-between gap-3">
            <button className="ui-button ui-button-secondary" disabled={selectedIndex === 0 || editing} onClick={() => setSelectedNumber(slides[selectedIndex - 1].number)} type="button">Previous</button>
            <button className="ui-button ui-button-secondary" disabled={selectedIndex === slides.length - 1 || editing} onClick={() => setSelectedNumber(slides[selectedIndex + 1].number)} type="button">Next</button>
          </div>
        </section>
      </div>

      <section className="sticky bottom-0 z-10 mt-6 rounded-2xl border border-[var(--line)] bg-[color-mix(in_srgb,var(--surface)_94%,transparent)] p-4 shadow-[0_-10px_35px_rgba(23,23,19,0.08)] backdrop-blur sm:p-5" aria-label="Slide feedback">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end">
          <label className="flex-1 font-semibold" htmlFor="slide-feedback">
            Feedback for slide {selected.number}
            <textarea
              className="mt-2 min-h-24 w-full resize-y rounded-xl border border-[var(--line)] bg-white px-3 py-3 text-sm font-normal"
              disabled={mutating}
              id="slide-feedback"
              onChange={(event) => setDrafts((current) => ({ ...current, [selected.number]: event.target.value }))}
              placeholder="Describe what should change on this slide"
              value={drafts[selected.number] ?? ""}
            />
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button className="ui-button ui-button-secondary" disabled={mutating || !undoAvailable} onClick={undoSlide} type="button">{mutation === "undo" ? "Undoing..." : "Undo slide"}</button>
            <button className="ui-button ui-button-primary" disabled={mutating} onClick={sendFeedback} type="button">{editing ? "Applying feedback..." : "Send feedback"}</button>
          </div>
        </div>
        {mutationError ? <p className="mt-3 text-sm text-[var(--danger)]" role="alert">{mutationError}</p> : null}
        {mutating ? <p className="mt-3 text-sm text-[var(--muted)]" role="status">{editing ? "Updating all requested slides..." : `Restoring slide ${selected.number}...`}</p> : null}
      </section>
    </main>
  );
}

function downloadName(title: string | null): string {
  const name = (title?.trim() || "untitled-presentation")
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return name || "untitled-presentation";
}

function isTextEntryTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || target.matches("input, textarea, select"));
}

function EditorState({ title, message, busy = false, action }: { title: string; message: string; busy?: boolean; action?: React.ReactNode }) {
  return (
    <main className="mx-auto grid min-h-[70dvh] max-w-3xl place-items-center px-5 py-12">
      <section className="w-full rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-8 text-center" aria-busy={busy || undefined}>
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-[var(--muted)]">Presentation editor</p>
        <h1 className="mt-3 text-2xl font-semibold tracking-[-0.035em]">{title}</h1>
        <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-[var(--muted)]">{message}</p>
        {action ? <div className="mt-6">{action}</div> : null}
        {!busy ? <Link className="mt-5 inline-block text-sm font-semibold text-[var(--accent)]" href="/home">Back to presentations</Link> : null}
      </section>
    </main>
  );
}

async function loadDetail(authFetch: ReturnType<typeof useAuth>["authFetch"], generationId: string): Promise<{ kind: "detail"; detail: PresentationDetail } | { kind: "not-found" } | { kind: "error"; message: string }> {
  try {
    const response = await authFetch(`/api/slides/${generationId}`);
    if (response.status === 404) return { kind: "not-found" };
    if (!response.ok) return { kind: "error", message: await responseMessage(response, "We could not load this presentation.") };
    return { kind: "detail", detail: await response.json() as PresentationDetail };
  } catch {
    return { kind: "error", message: "We could not load this presentation. Check your connection and retry." };
  }
}

function applyDetail(detail: PresentationDetail, setDetail: (detail: PresentationDetail) => void, setSlides: (slides: SlideDocument[]) => void, setSelectedNumber: React.Dispatch<React.SetStateAction<number>>) {
  const slides = detail.status === "COMPLETED" && detail.document ? detail.document.slides : [];
  setDetail(detail);
  setSlides(slides);
  setSelectedNumber((current) => (slides.some((slide) => slide.number === current) ? current : (slides[0]?.number ?? 1)));
}

async function responseMessage(response: Response, fallback: string): Promise<string> {
  try {
    const body = await response.json() as ApiErrorBody;
    return body.error?.message?.trim() || (response.status === 409 ? "The presentation changed. Reload and try again." : fallback);
  } catch {
    return response.status === 409 ? "The presentation changed. Reload and try again." : fallback;
  }
}
