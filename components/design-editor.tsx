"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { useAuth } from "@/lib/auth/auth-context";
import { createBlankDocument, renumberSlides, toWireSlides } from "@/lib/slides/design-document";
import type { ApiErrorBody, DesignSaveRequest, PresentationDetail } from "@/lib/types";
import type { SlideDocument } from "@/modules/slides/domain/structured/types";
import { SlideHtmlCanvas, type SlideHtmlCanvasHandle } from "@/components/slide-html-canvas";

type LoadState = "loading" | "ready" | "not-found" | "error" | "unavailable";
type SaveState = "idle" | "saving" | "error" | "conflict";

export function DesignEditor({ generationId }: { generationId: string }) {
  const { authFetch } = useAuth();
  const canvasRef = useRef<SlideHtmlCanvasHandle | null>(null);

  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [loadError, setLoadError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [detail, setDetail] = useState<PresentationDetail | null>(null);

  const [title, setTitle] = useState("");
  const [slides, setSlides] = useState<SlideDocument[]>([]);
  const [revisionNumber, setRevisionNumber] = useState<number | null>(null);
  const [selectedSlideNumber, setSelectedSlideNumber] = useState(1);

  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState("");
  const [downloadError, setDownloadError] = useState("");
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    let active = true;
    void authFetch(`/api/slides/${generationId}`)
      .then(async (response) => {
        if (!active) return;
        if (response.status === 404) {
          setLoadState("not-found");
          return;
        }
        if (!response.ok) {
          setLoadError(await responseMessage(response, "We could not load this presentation."));
          setLoadState("error");
          return;
        }
        const body = (await response.json()) as PresentationDetail;
        setDetail(body);
        if (!body.document) {
          setLoadState("unavailable");
          return;
        }
        setTitle(body.title ?? "Untitled design");
        setSlides(body.document.slides.length ? body.document.slides : createBlankDocument(1));
        setRevisionNumber(body.revisionNumber);
        setSelectedSlideNumber(1);
        setDirty(false);
        setLoadState("ready");
      })
      .catch(() => {
        if (active) {
          setLoadError("We could not load this presentation. Check your connection and retry.");
          setLoadState("error");
        }
      });
    return () => {
      active = false;
    };
  }, [authFetch, generationId, reloadKey]);

  function retryLoad() {
    setLoadState("loading");
    setLoadError("");
    setReloadKey((key) => key + 1);
  }

  const activeSlide = slides.find((slide) => slide.number === selectedSlideNumber) ?? slides[0];

  function commitSlide(html: string, css: string) {
    if (!activeSlide) return;
    setSlides((current) => current.map((slide) => (slide.number === activeSlide.number ? { ...slide, html, css } : slide)));
    setDirty(true);
  }

  function addSlide() {
    const next = renumberSlides([...slides, ...createBlankDocument(1).map((slide) => ({ ...slide, number: slides.length + 1 }))]);
    setSlides(next);
    setDirty(true);
    setSelectedSlideNumber(next.length);
  }

  function deleteSlide(number: number) {
    if (slides.length <= 1) return;
    const next = renumberSlides(slides.filter((slide) => slide.number !== number));
    setSlides(next);
    setDirty(true);
    setSelectedSlideNumber((current) => (current === number ? Math.max(1, current - 1) : current > number ? current - 1 : current));
  }

  function moveSlide(number: number, direction: "up" | "down") {
    const index = slides.findIndex((slide) => slide.number === number);
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (index < 0 || targetIndex < 0 || targetIndex >= slides.length) return;
    const reordered = [...slides];
    [reordered[index], reordered[targetIndex]] = [reordered[targetIndex], reordered[index]];
    const next = renumberSlides(reordered);
    setSlides(next);
    setDirty(true);
    setSelectedSlideNumber(direction === "up" ? number - 1 : number + 1);
  }

  async function save(): Promise<boolean> {
    if (!activeSlide) return false;
    const serialized = canvasRef.current?.serialize();
    if (!serialized) return false;
    const nextSlides = slides.map((slide) => (slide.number === activeSlide.number ? { ...slide, html: serialized.html, css: serialized.css } : slide));

    setSaveState("saving");
    setSaveError("");
    const body: DesignSaveRequest = { generationId, slides: toWireSlides(nextSlides), expectedRevision: revisionNumber };
    try {
      const response = await authFetch("/api/slides/design/save", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (response.status === 409) {
        setSaveState("conflict");
        return false;
      }
      if (!response.ok) throw new Error(await responseMessage(response, "This design could not be saved."));
      const updated = (await response.json()) as PresentationDetail;
      setDetail(updated);
      setRevisionNumber(updated.revisionNumber);
      if (updated.document) setSlides(updated.document.slides);
      setDirty(false);
      setSaveState("idle");
      return true;
    } catch (error) {
      setSaveState("error");
      setSaveError(error instanceof Error ? error.message : "This design could not be saved.");
      return false;
    }
  }

  function reloadAfterConflict() {
    setSaveState("idle");
    setSaveError("");
    retryLoad();
  }

  async function download() {
    setDownloadError("");
    if (dirty) {
      const saved = await save();
      if (!saved) {
        setDownloadError("Could not save before download. Fix the issue above and try again.");
        return;
      }
    }
    setDownloading(true);
    try {
      const response = await authFetch(`/api/slides/${generationId}/download`);
      if (!response.ok) throw new Error(await responseMessage(response, "This deck could not be downloaded."));
      const html = await response.text();
      const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${downloadName(title)}.html`;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch (error) {
      setDownloadError(error instanceof Error ? error.message : "This deck could not be downloaded.");
    } finally {
      setDownloading(false);
    }
  }

  if (loadState === "loading") return <EditorState title="Loading design editor" message="Preparing your canvas..." busy />;
  if (loadState === "not-found") return <EditorState title="Presentation not found" message="This presentation is unavailable or you do not have access to it." />;
  if (loadState === "error") return <EditorState title="Presentation unavailable" message={loadError} action={<button className="ui-button ui-button-primary" onClick={retryLoad} type="button">Retry</button>} />;
  if (loadState === "unavailable") return <EditorState title="Not available in the visual editor yet" message="This presentation does not have a structured design document to edit here yet." action={<button className="ui-button ui-button-primary" onClick={retryLoad} type="button">Refresh</button>} />;
  if (!detail || !activeSlide) return null;

  return (
    <main className="mx-auto max-w-[100rem] px-4 py-6 sm:px-7 sm:py-9">
      <header className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div className="min-w-0">
          <Link className="font-mono text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent)]" href="/home">
            Back to presentations
          </Link>
          <input
            aria-label="Presentation title"
            className="mt-2 block w-full max-w-md rounded-lg border border-transparent bg-transparent text-2xl font-semibold tracking-[-0.04em] hover:border-[var(--line)] focus:border-[var(--accent)] focus:outline-none"
            onChange={(event) => {
              setTitle(event.target.value);
              setDirty(true);
            }}
            value={title}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button className="ui-button ui-button-secondary" disabled={downloading} onClick={() => void download()} type="button">
            {downloading ? "Preparing..." : "Download HTML"}
          </button>
          <button className="ui-button ui-button-primary" disabled={saveState === "saving"} onClick={() => void save()} type="button">
            {saveState === "saving" ? "Saving..." : dirty ? "Save" : "Saved"}
          </button>
        </div>
      </header>

      {saveState === "conflict" ? (
        <p className="mb-4 rounded-xl border border-[var(--danger)] bg-red-50 px-4 py-3 text-sm text-[var(--danger)]" role="alert">
          This presentation changed elsewhere.{" "}
          <button className="underline" onClick={reloadAfterConflict} type="button">
            Reload
          </button>{" "}
          to see the latest version before saving again.
        </p>
      ) : null}
      {saveState === "error" && saveError ? (
        <p className="mb-4 rounded-xl border border-[var(--danger)] bg-red-50 px-4 py-3 text-sm text-[var(--danger)]" role="alert">
          {saveError}
        </p>
      ) : null}
      {downloadError ? (
        <p className="mb-4 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--muted)]" role="status">
          {downloadError}
        </p>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_16rem]">
        <section className="order-1 min-w-0">
          <SlideHtmlCanvas
            css={activeSlide.css}
            html={activeSlide.html}
            key={activeSlide.number}
            onDirtyChange={(isDirty) => {
              if (isDirty) {
                const serialized = canvasRef.current?.serialize();
                if (serialized) commitSlide(serialized.html, serialized.css);
              }
            }}
            ref={canvasRef}
            saveState={saveState === "saving" ? "saving" : dirty ? "dirty" : "saved"}
          />
        </section>

        <div className="order-2 flex flex-col gap-4">
          <nav className="flex gap-2 overflow-x-auto pb-2 xl:max-h-[70vh] xl:flex-col xl:overflow-y-auto" aria-label="Slides">
            {slides.map((slide, index) => (
              <div
                className={`min-w-32 rounded-xl border p-3 text-left text-sm ${slide.number === activeSlide.number ? "border-[var(--accent)] bg-blue-50 text-[var(--accent)]" : "border-[var(--line)] bg-[var(--surface)]"}`}
                key={slide.number}
              >
                <button
                  aria-current={slide.number === activeSlide.number ? "page" : undefined}
                  className="block w-full text-left"
                  onClick={() => setSelectedSlideNumber(slide.number)}
                  type="button"
                >
                  <span className="font-mono text-xs">{String(index + 1).padStart(2, "0")}</span>
                  <span className="mt-1 block truncate">Slide {slide.number}</span>
                </button>
                <div className="mt-2 flex gap-1">
                  <button aria-label={`Move slide ${slide.number} up`} className="text-xs underline" disabled={index === 0} onClick={() => moveSlide(slide.number, "up")} type="button">
                    Up
                  </button>
                  <button aria-label={`Move slide ${slide.number} down`} className="text-xs underline" disabled={index === slides.length - 1} onClick={() => moveSlide(slide.number, "down")} type="button">
                    Down
                  </button>
                  <button aria-label={`Delete slide ${slide.number}`} className="text-xs text-[var(--danger)] underline" disabled={slides.length <= 1} onClick={() => deleteSlide(slide.number)} type="button">
                    Delete
                  </button>
                </div>
              </div>
            ))}
            <button className="ui-button ui-button-secondary" onClick={addSlide} type="button">
              + Add slide
            </button>
          </nav>
        </div>
      </div>
    </main>
  );
}

function EditorState({ title, message, busy = false, action }: { title: string; message: string; busy?: boolean; action?: React.ReactNode }) {
  return (
    <main className="mx-auto grid min-h-[70dvh] max-w-3xl place-items-center px-5 py-12">
      <section className="w-full rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-8 text-center" aria-busy={busy || undefined}>
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-[var(--muted)]">Design editor</p>
        <h1 className="mt-3 text-2xl font-semibold tracking-[-0.035em]">{title}</h1>
        <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-[var(--muted)]">{message}</p>
        {action ? <div className="mt-6">{action}</div> : null}
        {!busy ? <Link className="mt-5 inline-block text-sm font-semibold text-[var(--accent)]" href="/home">Back to presentations</Link> : null}
      </section>
    </main>
  );
}

function downloadName(title: string | null): string {
  const name = (title?.trim() || "untitled-design")
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return name || "untitled-design";
}

async function responseMessage(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as ApiErrorBody;
    return body.error?.message?.trim() || fallback;
  } catch {
    return fallback;
  }
}
