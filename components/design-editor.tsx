"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { useAuth } from "@/lib/auth/auth-context";
import {
  animationRegistry,
  clampToSlide,
  createBlankDocument,
  createElementId,
  createImageElement,
  createShapeElement,
  createTableElement,
  createTextElement,
  CURRENT_ANIMATION_REGISTRY_VERSION,
  DEFAULT_ELEMENT_SIZE,
  isAllowedImageSrc,
  isShapeElement,
  isTableElement,
  isTextElement,
  renumberSlides,
  resizeTable,
  setTableCellContent,
  tableCellContent,
  TEXT_STYLE_PRESETS,
  TEXT_STYLE_TYPES,
  toWireSlides,
  type ElementNode,
  type ShapeProps,
  type SlideDocument,
  type TableProps,
  type TextProps,
  type TextStyleType,
} from "@/lib/slides/design-document";
import type { ApiErrorBody, DesignSaveRequest, PresentationDetail } from "@/lib/types";
import { DesignCanvas, type CanvasTool } from "@/components/design-canvas";

const MAX_HISTORY = 50;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const TOOLS: { tool: CanvasTool; label: string }[] = [
  { tool: "select", label: "Select" },
  { tool: "text", label: "Text" },
  { tool: "rectangle", label: "Rectangle" },
  { tool: "ellipse", label: "Ellipse" },
  { tool: "line", label: "Line" },
  { tool: "image", label: "Image" },
  { tool: "table", label: "Table" },
];

type LoadState = "loading" | "ready" | "not-found" | "error" | "unavailable";
type SaveState = "idle" | "saving" | "error" | "conflict";

export function DesignEditor({ generationId }: { generationId: string }) {
  const { authFetch } = useAuth();
  const imageInputRef = useRef<HTMLInputElement | null>(null);

  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [loadError, setLoadError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [detail, setDetail] = useState<PresentationDetail | null>(null);

  const [title, setTitle] = useState("");
  const [slides, setSlides] = useState<SlideDocument[]>([]);
  const [revisionNumber, setRevisionNumber] = useState<number | null>(null);
  const [selectedSlideNumber, setSelectedSlideNumber] = useState(1);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [selectedCell, setSelectedCell] = useState<{ row: number; column: number } | null>(null);
  const [tool, setTool] = useState<CanvasTool>("select");

  const [history, setHistory] = useState<SlideDocument[][]>([]);
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
        setSelectedElementId(null);
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

  function applyMutation(next: SlideDocument[]) {
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
  const layerOrder = activeSlide ? [...activeSlide.elements].sort((a, b) => (a.geometry.zIndex ?? 0) - (b.geometry.zIndex ?? 0)) : [];
  const selectedLayerIndex = selectedElementId ? layerOrder.findIndex((element) => element.id === selectedElementId) : -1;
  const canMoveForward = selectedLayerIndex >= 0 && selectedLayerIndex < layerOrder.length - 1;
  const canMoveBackward = selectedLayerIndex > 0;
  const selectedElement = activeSlide?.elements.find((element) => element.id === selectedElementId) ?? null;

  function commitElements(elements: ElementNode[]) {
    if (!activeSlide) return;
    applyMutation(slides.map((slide) => (slide.number === activeSlide.number ? { ...slide, elements } : slide)));
  }

  function updateSelectedElement(updater: (element: ElementNode) => ElementNode) {
    if (!activeSlide || !selectedElementId) return;
    commitElements(activeSlide.elements.map((element) => (element.id === selectedElementId ? updater(element) : element)));
  }

  function createElement(toolKind: CanvasTool, x: number, y: number) {
    if (!activeSlide || toolKind === "select") return;
    if (toolKind === "image") {
      imageInputRef.current?.click();
      setTool("select");
      return;
    }
    const zIndex = (activeSlide.elements.at(-1)?.geometry.zIndex ?? 0) + 1;
    const element =
      toolKind === "text"
        ? createTextElement(x, y, zIndex)
        : toolKind === "table"
          ? createTableElement(2, 2, x, y, zIndex)
          : createShapeElement(toolKind, x, y, zIndex);
    commitElements([...activeSlide.elements, element]);
    setSelectedElementId(element.id);
    setSelectedCell(null);
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
      const zIndex = (activeSlide.elements.at(-1)?.geometry.zIndex ?? 0) + 1;
      const element = createImageElement(src, file.name, bounds.x, bounds.y, zIndex);
      commitElements([...activeSlide.elements, element]);
      setSelectedElementId(element.id);
    };
    reader.readAsDataURL(file);
  }

  function moveLayer(direction: "forward" | "backward") {
    if (!activeSlide || !selectedElementId) return;
    const elements = [...activeSlide.elements].sort((a, b) => (a.geometry.zIndex ?? 0) - (b.geometry.zIndex ?? 0));
    const index = elements.findIndex((element) => element.id === selectedElementId);
    const targetIndex = direction === "forward" ? index + 1 : index - 1;
    if (index < 0 || targetIndex < 0 || targetIndex >= elements.length) return;
    const swapped = [...elements];
    const currentZ = swapped[index].geometry.zIndex;
    swapped[index] = { ...swapped[index], geometry: { ...swapped[index].geometry, zIndex: swapped[targetIndex].geometry.zIndex } };
    swapped[targetIndex] = { ...swapped[targetIndex], geometry: { ...swapped[targetIndex].geometry, zIndex: currentZ } };
    commitElements(swapped);
  }

  function addSlide() {
    const next = renumberSlides([...slides, ...createBlankDocument(1).map((slide) => ({ ...slide, number: slides.length + 1 }))]);
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

  async function save(): Promise<boolean> {
    setSaveState("saving");
    setSaveError("");
    const body: DesignSaveRequest = { generationId, slides: toWireSlides(slides), expectedRevision: revisionNumber };
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
          <button className="ui-button ui-button-secondary" disabled={!history.length} onClick={undo} type="button">
            Undo
          </button>
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

      <input accept="image/png,image/jpeg,image/webp" className="hidden" onChange={handleImageSelected} ref={imageInputRef} type="file" />

      <div className="grid gap-5 xl:grid-cols-[10rem_minmax(0,1fr)_16rem]">
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
            onSelectElement={(id) => {
              setSelectedElementId(id);
              setSelectedCell(null);
            }}
            onCommitElements={commitElements}
            onCreateElement={createElement}
          />
        </section>

        <div className="order-4 flex flex-col gap-4 xl:order-3">
          {selectedElement ? (
            <ElementProperties
              element={selectedElement}
              selectedCell={selectedCell}
              onSelectCell={setSelectedCell}
              onChange={updateSelectedElement}
            />
          ) : null}

          <nav className="flex gap-2 overflow-x-auto pb-2 xl:max-h-[50vh] xl:flex-col xl:overflow-y-auto" aria-label="Slides">
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
                    setSelectedCell(null);
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
      </div>
    </main>
  );
}

function ElementProperties({
  element,
  selectedCell,
  onSelectCell,
  onChange,
}: {
  element: ElementNode;
  selectedCell: { row: number; column: number } | null;
  onSelectCell(cell: { row: number; column: number } | null): void;
  onChange(updater: (element: ElementNode) => ElementNode): void;
}) {
  const animationKeys = animationRegistry.listKeys(CURRENT_ANIMATION_REGISTRY_VERSION);

  return (
    <section aria-label="Element properties" className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4">
      <h2 className="font-mono text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">Properties</h2>
      <div className="mt-3 space-y-4">
        {isTextElement(element) ? <TextProperties props={element.props} onChange={(patch) => onChange((el) => ({ ...el, props: { ...(el.props as TextProps), ...patch } }))} /> : null}
        {isShapeElement(element) ? <ShapeProperties props={element.props} onChange={(patch) => onChange((el) => ({ ...el, props: { ...(el.props as ShapeProps), ...patch } }))} /> : null}
        {isTableElement(element) ? (
          <TableProperties
            element={element}
            selectedCell={selectedCell}
            onSelectCell={onSelectCell}
            onChange={onChange}
          />
        ) : null}
        <AnimationProperties element={element} keys={animationKeys} onChange={onChange} />
      </div>
    </section>
  );
}

function ToggleButton({ active, label, onClick }: { active: boolean; label: string; onClick(): void }) {
  return (
    <button
      aria-pressed={active}
      className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold ${active ? "border-[var(--accent)] bg-blue-50 text-[var(--accent)]" : "border-[var(--line)] bg-white"}`}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}

function TextProperties({ props, onChange }: { props: TextProps; onChange(patch: Partial<TextProps>): void }) {
  return (
    <div className="space-y-3">
      <label className="block text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
        Style
        <select
          className="mt-1 w-full rounded-lg border border-[var(--line)] px-2 py-1.5 text-sm"
          onChange={(event) => {
            const styleType = event.target.value as TextStyleType;
            const preset = TEXT_STYLE_PRESETS[styleType];
            onChange({ styleType, fontSize: preset.fontSize, fontWeight: preset.fontWeight });
          }}
          value={props.styleType}
        >
          {TEXT_STYLE_TYPES.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
      </label>
      <div className="flex flex-wrap gap-1.5">
        <ToggleButton active={props.bold} label="Bold" onClick={() => onChange({ bold: !props.bold })} />
        <ToggleButton active={props.italic} label="Italic" onClick={() => onChange({ italic: !props.italic })} />
        <ToggleButton active={props.underline} label="Underline" onClick={() => onChange({ underline: !props.underline })} />
        <ToggleButton active={props.list === "bullet"} label="Bullets" onClick={() => onChange({ list: props.list === "bullet" ? "none" : "bullet" })} />
      </div>
      <div className="flex gap-1.5">
        <ToggleButton active={props.align === "left"} label="Left" onClick={() => onChange({ align: "left" })} />
        <ToggleButton active={props.align === "center"} label="Center" onClick={() => onChange({ align: "center" })} />
        <ToggleButton active={props.align === "right"} label="Right" onClick={() => onChange({ align: "right" })} />
      </div>
      <label className="block text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
        Text color
        <input className="mt-1 h-9 w-full rounded-lg border border-[var(--line)]" onChange={(event) => onChange({ color: event.target.value })} type="color" value={props.color} />
      </label>
      <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
        <input checked={props.backgroundColor !== null} onChange={(event) => onChange({ backgroundColor: event.target.checked ? "#ffffff" : null })} type="checkbox" />
        Background fill
      </label>
      {props.backgroundColor !== null ? (
        <input className="h-9 w-full rounded-lg border border-[var(--line)]" onChange={(event) => onChange({ backgroundColor: event.target.value })} type="color" value={props.backgroundColor} />
      ) : null}
    </div>
  );
}

function ShapeProperties({ props, onChange }: { props: ShapeProps; onChange(patch: Partial<ShapeProps>): void }) {
  return (
    <div className="space-y-3">
      <label className="block text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
        Fill
        <input className="mt-1 h-9 w-full rounded-lg border border-[var(--line)]" onChange={(event) => onChange({ fill: event.target.value })} type="color" value={props.fill} />
      </label>
      <label className="block text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
        Stroke
        <input className="mt-1 h-9 w-full rounded-lg border border-[var(--line)]" onChange={(event) => onChange({ stroke: event.target.value })} type="color" value={props.stroke} />
      </label>
      <label className="block text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
        Stroke width
        <input
          className="mt-1 w-full rounded-lg border border-[var(--line)] px-2 py-1.5 text-sm"
          max={64}
          min={0}
          onChange={(event) => onChange({ strokeWidth: Number(event.target.value) || 0 })}
          type="number"
          value={props.strokeWidth}
        />
      </label>
    </div>
  );
}

function TableProperties({
  element,
  selectedCell,
  onSelectCell,
  onChange,
}: {
  element: ElementNode;
  selectedCell: { row: number; column: number } | null;
  onSelectCell(cell: { row: number; column: number } | null): void;
  onChange(updater: (element: ElementNode) => ElementNode): void;
}) {
  const props = element.props as TableProps;
  const cellContent = selectedCell ? tableCellContent(element, selectedCell.row, selectedCell.column) : null;
  const cellText = cellContent && isTextElement(cellContent) ? cellContent.props.text : "";

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <label className="block text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
          Rows
          <input
            className="mt-1 w-full rounded-lg border border-[var(--line)] px-2 py-1.5 text-sm"
            max={50}
            min={1}
            onChange={(event) => onChange((el) => resizeTable(el, Math.max(1, Number(event.target.value) || 1), props.columns))}
            type="number"
            value={props.rows}
          />
        </label>
        <label className="block text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
          Columns
          <input
            className="mt-1 w-full rounded-lg border border-[var(--line)] px-2 py-1.5 text-sm"
            max={50}
            min={1}
            onChange={(event) => onChange((el) => resizeTable(el, props.rows, Math.max(1, Number(event.target.value) || 1)))}
            type="number"
            value={props.columns}
          />
        </label>
      </div>
      <label className="block text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
        Border color
        <input className="mt-1 h-9 w-full rounded-lg border border-[var(--line)]" onChange={(event) => onChange((el) => ({ ...el, props: { ...(el.props as TableProps), borderColor: event.target.value } }))} type="color" value={props.borderColor} />
      </label>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Cells</p>
        <div className="mt-1 grid gap-1" style={{ gridTemplateColumns: `repeat(${props.columns}, minmax(0, 1fr))` }}>
          {Array.from({ length: props.rows }, (_, row) =>
            Array.from({ length: props.columns }, (_, column) => (
              <button
                aria-label={`Edit cell row ${row + 1} column ${column + 1}`}
                aria-pressed={selectedCell?.row === row && selectedCell?.column === column}
                className={`rounded border px-2 py-1 text-xs ${selectedCell?.row === row && selectedCell?.column === column ? "border-[var(--accent)] bg-blue-50" : "border-[var(--line)] bg-white"}`}
                key={`${row}-${column}`}
                onClick={() => onSelectCell({ row, column })}
                type="button"
              >
                {row + 1},{column + 1}
              </button>
            )),
          )}
        </div>
      </div>

      {selectedCell ? (
        <div className="rounded-xl border border-[var(--line)] bg-white p-3">
          <label className="block text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
            Cell text (row {selectedCell.row + 1}, column {selectedCell.column + 1})
            <textarea
              className="mt-1 min-h-16 w-full resize-y rounded-lg border border-[var(--line)] px-2 py-1.5 text-sm"
              onChange={(event) => {
                const text = event.target.value;
                onChange((el) => {
                  if (!text) return setTableCellContent(el, selectedCell.row, selectedCell.column, null);
                  const existing = tableCellContent(el, selectedCell.row, selectedCell.column);
                  const content: ElementNode =
                    existing && isTextElement(existing)
                      ? { ...existing, props: { ...existing.props, text } }
                      : {
                          id: createElementId(),
                          type: "text",
                          schemaVersion: 1,
                          geometry: { x: null, y: null, width: null, height: null, zIndex: null },
                          props: { text, styleType: "body", fontSize: 16, fontWeight: 400, color: "#171713", backgroundColor: null, align: "left", bold: false, italic: false, underline: false, list: "none" },
                          animation: null,
                          children: [],
                        };
                  return setTableCellContent(el, selectedCell.row, selectedCell.column, content);
                });
              }}
              value={cellText}
            />
          </label>
        </div>
      ) : null}
    </div>
  );
}

function AnimationProperties({ element, keys, onChange }: { element: ElementNode; keys: string[]; onChange(updater: (element: ElementNode) => ElementNode): void }) {
  const animation = element.animation;
  const durationMs = typeof animation?.props.durationMs === "number" ? animation.props.durationMs : 500;
  const delayMs = typeof animation?.props.delayMs === "number" ? animation.props.delayMs : 0;

  return (
    <div className="space-y-3 border-t border-[var(--line)] pt-3">
      <label className="block text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
        Entrance animation
        <select
          className="mt-1 w-full rounded-lg border border-[var(--line)] px-2 py-1.5 text-sm"
          onChange={(event) => {
            const key = event.target.value;
            onChange((el) => ({ ...el, animation: key === "none" ? null : { key, props: { durationMs, delayMs } } }));
          }}
          value={animation?.key ?? "none"}
        >
          <option value="none">None</option>
          {keys.map((key) => (
            <option key={key} value={key}>
              {key}
            </option>
          ))}
        </select>
      </label>
      {animation ? (
        <div className="grid grid-cols-2 gap-2">
          <label className="block text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
            Duration (ms)
            <input
              className="mt-1 w-full rounded-lg border border-[var(--line)] px-2 py-1.5 text-sm"
              max={10000}
              min={0}
              onChange={(event) => onChange((el) => ({ ...el, animation: el.animation ? { ...el.animation, props: { ...el.animation.props, durationMs: Number(event.target.value) || 0 } } : null }))}
              type="number"
              value={durationMs}
            />
          </label>
          <label className="block text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
            Delay (ms)
            <input
              className="mt-1 w-full rounded-lg border border-[var(--line)] px-2 py-1.5 text-sm"
              max={10000}
              min={0}
              onChange={(event) => onChange((el) => ({ ...el, animation: el.animation ? { ...el.animation, props: { ...el.animation.props, delayMs: Number(event.target.value) || 0 } } : null }))}
              type="number"
              value={delayMs}
            />
          </label>
        </div>
      ) : null}
    </div>
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
