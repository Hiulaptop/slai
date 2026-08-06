"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { useAuth } from "@/lib/auth/auth-context";
import { exportStandalonePresentation } from "@/lib/slides/export-document";
import {
  clampToSlide,
  createBlankDocument,
  createBlankSlide,
  createElementId,
  isAllowedImageSrc,
  parseDesignSlides,
  renumberSlides,
  serializeDesignDocument,
  type DesignSlide,
  type SlideElement,
  type SlideElementType,
} from "@/lib/slides/design-document";
import type { ApiErrorBody, DesignSaveRequest, PresentationDetail } from "@/lib/types";
import { DEFAULT_ELEMENT_SIZE, DesignCanvas, type CanvasTool } from "@/components/design-canvas";

const MAX_HISTORY = 50;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const TOOLS: { tool: CanvasTool; label: string }[] = [
  { tool: "select", label: "Select" },
  { tool: "text", label: "Text" },
  { tool: "rectangle", label: "Rectangle" },
  { tool: "ellipse", label: "Ellipse" },
  { tool: "line", label: "Line" },
  { tool: "image", label: "Image" },
];

type LoadState = "loading" | "ready" | "not-found" | "error";
type SaveState = "idle" | "saving" | "error" | "conflict";

export function DesignEditor({ generationId }: { generationId: string }) {
  const { authFetch } = useAuth();
  const imageInputRef = useRef<HTMLInputElement | null>(null);

  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [loadError, setLoadError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [detail, setDetail] = useState<PresentationDetail | null>(null);

  const [title, setTitle] = useState("");
  const [slides, setSlides] = useState<DesignSlide[]>([]);
  const [revisionNumber, setRevisionNumber] = useState<number | null>(null);
  const [selectedSlideNumber, setSelectedSlideNumber] = useState(1);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [tool, setTool] = useState<CanvasTool>("select");

  const [history, setHistory] = useState<DesignSlide[][]>([]);
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState("");
  const [downloadError, setDownloadError] = useState("");

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
        setTitle(body.title ?? "Untitled design");
        const parsed = safeParse(body.html);
        setSlides(parsed.length ? parsed : createBlankDocument(1));
        setRevisionNumber(body.revisionNumber);
        setSelectedSlideNumber(1);
        setHistory([]);
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

  function applyMutation(next: DesignSlide[]) {
    setHistory((current) => [...current, slides].slice(-MAX_HISTORY));
    setSlides(next);
    setDirty(true);
  }

  function undo() {
    setHistory((current) => {
      if (!current.length) return current;
      const previous = current[current.length - 1];
      setSlides(previous);
      setDirty(true);
      return current.slice(0, -1);
    });
  }

  const activeSlide = slides.find((slide) => slide.number === selectedSlideNumber) ?? slides[0];
  const layerOrder = activeSlide ? [...activeSlide.elements].sort((a, b) => a.zIndex - b.zIndex) : [];
  const selectedLayerIndex = selectedElementId ? layerOrder.findIndex((element) => element.id === selectedElementId) : -1;
  const canMoveForward = selectedLayerIndex >= 0 && selectedLayerIndex < layerOrder.length - 1;
  const canMoveBackward = selectedLayerIndex > 0;

  function commitElements(elements: SlideElement[]) {
    if (!activeSlide) return;
    applyMutation(slides.map((slide) => (slide.number === activeSlide.number ? { ...slide, elements } : slide)));
  }

  function createElement(type: SlideElementType, x: number, y: number) {
    if (!activeSlide) return;
    if (type === "image") {
      imageInputRef.current?.click();
      setTool("select");
      return;
    }
    const size = DEFAULT_ELEMENT_SIZE[type];
    const bounds = clampToSlide({ x, y, width: size.width, height: size.height });
    const zIndex = (activeSlide.elements.at(-1)?.zIndex ?? 0) + 1;
    const id = createElementId();
    const element: SlideElement =
      type === "text"
        ? { id, type: "text", ...bounds, zIndex, text: "Text", fontSize: 24, color: "#171713", align: "left" }
        : type === "rectangle"
          ? { id, type: "rectangle", ...bounds, zIndex, fill: "#2448d8", stroke: "#171713" }
          : type === "ellipse"
            ? { id, type: "ellipse", ...bounds, zIndex, fill: "#2448d8", stroke: "#171713" }
            : { id, type: "line", ...bounds, zIndex, stroke: "#171713" };

    applyMutation(slides.map((slide) => (slide.number === activeSlide.number ? { ...slide, elements: [...slide.elements, element] } : slide)));
    setSelectedElementId(id);
    setTool("select");
  }

  function handleImageSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !activeSlide) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > MAX_IMAGE_BYTES) {
      setSaveError("Images must be PNG, JPEG, or WebP and no larger than 5 MiB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const src = String(reader.result ?? "");
      if (!isAllowedImageSrc(src)) return;
      const size = DEFAULT_ELEMENT_SIZE.image;
      const bounds = clampToSlide({ x: (960 - size.width) / 2, y: (540 - size.height) / 2, width: size.width, height: size.height });
      const id = createElementId();
      const zIndex = (activeSlide.elements.at(-1)?.zIndex ?? 0) + 1;
      const element: SlideElement = { id, type: "image", ...bounds, zIndex, src, alt: file.name };
      applyMutation(slides.map((slide) => (slide.number === activeSlide.number ? { ...slide, elements: [...slide.elements, element] } : slide)));
      setSelectedElementId(id);
    };
    reader.readAsDataURL(file);
  }

  function moveLayer(direction: "forward" | "backward") {
    if (!activeSlide || !selectedElementId) return;
    const elements = [...activeSlide.elements].sort((a, b) => a.zIndex - b.zIndex);
    const index = elements.findIndex((element) => element.id === selectedElementId);
    const targetIndex = direction === "forward" ? index + 1 : index - 1;
    if (index < 0 || targetIndex < 0 || targetIndex >= elements.length) return;
    const swapped = [...elements];
    const currentZ = swapped[index].zIndex;
    swapped[index] = { ...swapped[index], zIndex: swapped[targetIndex].zIndex };
    swapped[targetIndex] = { ...swapped[targetIndex], zIndex: currentZ };
    commitElements(swapped);
  }

  function addSlide() {
    const next = renumberSlides([...slides, createBlankSlide(slides.length + 1)]);
    applyMutation(next);
    setSelectedSlideNumber(next.length);
    setSelectedElementId(null);
  }

  function deleteSlide(number: number) {
    if (slides.length <= 1) return;
    const next = renumberSlides(slides.filter((slide) => slide.number !== number));
    applyMutation(next);
    setSelectedSlideNumber((current) => (current === number ? Math.max(1, current - 1) : current > number ? current - 1 : current));
    setSelectedElementId(null);
  }

  function moveSlide(number: number, direction: "up" | "down") {
    const index = slides.findIndex((slide) => slide.number === number);
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (index < 0 || targetIndex < 0 || targetIndex >= slides.length) return;
    const reordered = [...slides];
    [reordered[index], reordered[targetIndex]] = [reordered[targetIndex], reordered[index]];
    const next = renumberSlides(reordered);
    applyMutation(next);
    setSelectedSlideNumber(direction === "up" ? number - 1 : number + 1);
  }

  async function save(): Promise<string | null> {
    setSaveState("saving");
    setSaveError("");
    const html = serializeDesignDocument(title, slides);
    const body: DesignSaveRequest = { generationId, html, expectedRevision: revisionNumber };
    try {
      const response = await authFetch("/api/slides/design/save", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (response.status === 409) {
        setSaveState("conflict");
        return null;
      }
      if (!response.ok) throw new Error(await responseMessage(response, "This design could not be saved."));
      const updated = (await response.json()) as PresentationDetail;
      setDetail(updated);
      setRevisionNumber(updated.revisionNumber);
      setDirty(false);
      setSaveState("idle");
      return updated.html ?? html;
    } catch (error) {
      setSaveState("error");
      setSaveError(error instanceof Error ? error.message : "This design could not be saved.");
      return null;
    }
  }

  function reloadAfterConflict() {
    setSaveState("idle");
    setSaveError("");
    retryLoad();
  }

  async function download() {
    setDownloadError("");
    let html = serializeDesignDocument(title, slides);
    if (dirty) {
      const saved = await save();
      if (saved) html = saved;
      else setDownloadError("Could not save before download - downloading your current unsaved changes instead.");
    }
    try {
      const exported = exportStandalonePresentation(html);
      const url = URL.createObjectURL(new Blob([exported], { type: "text/html;charset=utf-8" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${downloadName(title)}.html`;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch {
      setDownloadError("This deck does not contain any slides to export yet.");
    }
  }

  if (loadState === "loading") return <EditorState title="Loading design editor" message="Preparing your canvas..." busy />;
  if (loadState === "not-found") return <EditorState title="Presentation not found" message="This presentation is unavailable or you do not have access to it." />;
  if (loadState === "error") return <EditorState title="Presentation unavailable" message={loadError} action={<button className="ui-button ui-button-primary" onClick={retryLoad} type="button">Retry</button>} />;
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
          <button className="ui-button ui-button-secondary" disabled={!history.length} onClick={undo} type="button">
            Undo
          </button>
          <button className="ui-button ui-button-secondary" onClick={download} type="button">
            Download HTML
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

      <input accept="image/png,image/jpeg,image/webp" className="hidden" onChange={handleImageSelected} ref={imageInputRef} type="file" />

      <div className="grid gap-5 xl:grid-cols-[10rem_minmax(0,1fr)_13rem]">
        <nav className="order-3 flex gap-2 overflow-x-auto pb-2 xl:order-1 xl:flex-col xl:overflow-visible" aria-label="Tools">
          {TOOLS.map(({ tool: toolOption, label }) => (
            <button
              aria-pressed={tool === toolOption}
              className={`rounded-xl border px-3 py-2 text-left text-sm ${tool === toolOption ? "border-[var(--accent)] bg-blue-50 text-[var(--accent)]" : "border-[var(--line)] bg-[var(--surface)]"}`}
              key={toolOption}
              onClick={() => setTool(toolOption)}
              type="button"
            >
              {label}
            </button>
          ))}
          <div className="mt-2 flex gap-2 xl:flex-col">
            <button className="ui-button ui-button-secondary" disabled={!canMoveForward} onClick={() => moveLayer("forward")} type="button">
              Bring forward
            </button>
            <button className="ui-button ui-button-secondary" disabled={!canMoveBackward} onClick={() => moveLayer("backward")} type="button">
              Send backward
            </button>
          </div>
        </nav>

        <section className="order-1 min-w-0 xl:order-2">
          <DesignCanvas
            slide={activeSlide}
            tool={tool}
            selectedElementId={selectedElementId}
            onSelectElement={setSelectedElementId}
            onCommitElements={commitElements}
            onCreateElement={createElement}
          />
        </section>

        <nav className="order-2 flex gap-2 overflow-x-auto pb-2 xl:order-3 xl:max-h-[68vh] xl:flex-col xl:overflow-y-auto" aria-label="Slides">
          {slides.map((slide, index) => (
            <div
              className={`min-w-32 rounded-xl border p-3 text-left text-sm ${slide.number === activeSlide.number ? "border-[var(--accent)] bg-blue-50 text-[var(--accent)]" : "border-[var(--line)] bg-[var(--surface)]"}`}
              key={slide.number}
            >
              <button
                aria-current={slide.number === activeSlide.number ? "page" : undefined}
                className="block w-full text-left"
                onClick={() => {
                  setSelectedSlideNumber(slide.number);
                  setSelectedElementId(null);
                }}
                type="button"
              >
                <span className="font-mono text-xs">{String(index + 1).padStart(2, "0")}</span>
                <span className="mt-1 block truncate">{slide.elements.length} element{slide.elements.length === 1 ? "" : "s"}</span>
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

function safeParse(html: string | null): DesignSlide[] {
  if (!html) return [];
  try {
    return parseDesignSlides(html);
  } catch {
    return [];
  }
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
