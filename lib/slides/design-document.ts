// Pure, framework-free model for the visual slide design editor's scene graph.
// Slides are stored server-side as one HTML document containing contiguous
// `.slai-slide[data-slide-number]` wrappers (same contract as
// lib/slides/slide-document.ts). Inside a wrapper, this module additionally
// recognizes elements tagged `data-slai-el`/`data-slai-el-type` as editable
// design elements, and can serialize a scene graph back into that same
// wrapper contract. Anything else inside a wrapper (including any stray
// script/iframe/form/unknown element) is ignored on parse, never re-emitted -
// this is the client-side half of task 3.4's content allowlist.

export const SLIDE_WIDTH = 960;
export const SLIDE_HEIGHT = 540;
const MIN_ELEMENT_SIZE = 8;

const SLIDE_SELECTOR = ".slai-slide[data-slide-number]";
const ALLOWED_IMAGE_SRC = /^data:image\/(png|jpeg|webp);base64,/i;

export type SlideElementType = "text" | "rectangle" | "ellipse" | "line" | "image";

interface SlideElementBase {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
}

export interface TextSlideElement extends SlideElementBase {
  type: "text";
  text: string;
  fontSize: number;
  color: string;
  align: "left" | "center" | "right";
}

export interface RectangleSlideElement extends SlideElementBase {
  type: "rectangle";
  fill: string;
  stroke: string;
}

export interface EllipseSlideElement extends SlideElementBase {
  type: "ellipse";
  fill: string;
  stroke: string;
}

export interface LineSlideElement extends SlideElementBase {
  type: "line";
  stroke: string;
}

export interface ImageSlideElement extends SlideElementBase {
  type: "image";
  src: string;
  alt: string;
}

export type SlideElement =
  | TextSlideElement
  | RectangleSlideElement
  | EllipseSlideElement
  | LineSlideElement
  | ImageSlideElement;

export interface DesignSlide {
  number: number;
  elements: SlideElement[];
}

let elementCounter = 0;

export function createElementId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  elementCounter += 1;
  return `el-${Date.now()}-${elementCounter}`;
}

export function createBlankSlide(number: number): DesignSlide {
  return { number, elements: [] };
}

export function createBlankDocument(slideCount: number): DesignSlide[] {
  const count = Math.max(1, Math.min(50, Math.trunc(slideCount) || 1));
  return Array.from({ length: count }, (_, index) => createBlankSlide(index + 1));
}

export function renumberSlides(slides: DesignSlide[]): DesignSlide[] {
  return slides.map((slide, index) => (slide.number === index + 1 ? slide : { ...slide, number: index + 1 }));
}

export function isAllowedImageSrc(src: string): boolean {
  return ALLOWED_IMAGE_SRC.test(src);
}

export function clampToSlide(bounds: { x: number; y: number; width: number; height: number }): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  const width = Math.max(MIN_ELEMENT_SIZE, Math.min(bounds.width, SLIDE_WIDTH));
  const height = Math.max(MIN_ELEMENT_SIZE, Math.min(bounds.height, SLIDE_HEIGHT));
  const x = Math.max(0, Math.min(bounds.x, SLIDE_WIDTH - width));
  const y = Math.max(0, Math.min(bounds.y, SLIDE_HEIGHT - height));
  return { x, y, width, height };
}

export function parseDesignSlides(html: string): DesignSlide[] {
  const document = new DOMParser().parseFromString(html, "text/html");
  const wrappers = Array.from(document.querySelectorAll(SLIDE_SELECTOR));

  return wrappers.map((wrapper, index) => {
    const number = Number(wrapper.getAttribute("data-slide-number"));
    if (!Number.isInteger(number) || number < 1 || number !== index + 1) {
      throw new Error("Presentation contains invalid slide numbering");
    }

    const elements = Array.from(wrapper.querySelectorAll("[data-slai-el]"))
      .map((node) => parseElement(node))
      .filter((element): element is SlideElement => element !== null);

    return { number, elements };
  });
}

function parseElement(node: Element): SlideElement | null {
  const type = node.getAttribute("data-slai-el-type");
  const id = node.getAttribute("data-slai-el") || createElementId();
  const style = (node as HTMLElement).style;
  const { x, y, width, height } = clampToSlide({
    x: parseFloat(style.left) || 0,
    y: parseFloat(style.top) || 0,
    width: parseFloat(style.width) || 0,
    height: parseFloat(style.height) || 0,
  });
  const zIndex = parseInt(style.zIndex, 10) || 0;
  const base = { id, x, y, width, height, zIndex };

  switch (type) {
    case "text":
      return {
        ...base,
        type: "text",
        text: node.textContent ?? "",
        fontSize: parseFloat(node.getAttribute("data-slai-font-size") ?? "") || 24,
        color: node.getAttribute("data-slai-color") ?? "#171713",
        align: asTextAlign(node.getAttribute("data-slai-align")),
      };
    case "rectangle":
      return {
        ...base,
        type: "rectangle",
        fill: node.getAttribute("data-slai-fill") ?? "#2448d8",
        stroke: node.getAttribute("data-slai-stroke") ?? "#171713",
      };
    case "ellipse":
      return {
        ...base,
        type: "ellipse",
        fill: node.getAttribute("data-slai-fill") ?? "#2448d8",
        stroke: node.getAttribute("data-slai-stroke") ?? "#171713",
      };
    case "line":
      return { ...base, type: "line", stroke: node.getAttribute("data-slai-stroke") ?? "#171713" };
    case "image": {
      const src = node.getAttribute("src") ?? "";
      if (!isAllowedImageSrc(src)) return null;
      return { ...base, type: "image", src, alt: node.getAttribute("alt") ?? "" };
    }
    default:
      return null;
  }
}

function asTextAlign(value: string | null): "left" | "center" | "right" {
  return value === "center" || value === "right" ? value : "left";
}

export function serializeDesignDocument(title: string, slides: DesignSlide[]): string {
  const body = renumberSlides(slides).map(serializeSlide).join("");
  const baseCss = "*{box-sizing:border-box;}html,body{margin:0;padding:0;background:#e5e2da;}" +
    `.slai-slide{margin:0 auto;background:#ffffff;}`;
  return (
    "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\" />" +
    "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />" +
    `<title>${escapeHtml(title || "Untitled presentation")}</title>` +
    `<style>${baseCss}</style></head><body>${body}</body></html>`
  );
}

function serializeSlide(slide: DesignSlide): string {
  const elements = [...slide.elements].sort((a, b) => a.zIndex - b.zIndex).map(serializeElement).join("");
  return (
    `<div class="slai-slide" data-slide-number="${slide.number}" ` +
    `style="position:relative;width:${SLIDE_WIDTH}px;height:${SLIDE_HEIGHT}px;overflow:hidden;background:#ffffff;">` +
    `${elements}</div>`
  );
}

function serializeElement(element: SlideElement): string {
  const position = `position:absolute;left:${element.x}px;top:${element.y}px;width:${element.width}px;height:${element.height}px;z-index:${element.zIndex};`;

  switch (element.type) {
    case "text":
      return (
        `<div data-slai-el="${element.id}" data-slai-el-type="text" ` +
        `data-slai-font-size="${element.fontSize}" data-slai-color="${escapeAttr(element.color)}" data-slai-align="${element.align}" ` +
        `style="${position}font-size:${element.fontSize}px;color:${escapeAttr(element.color)};text-align:${element.align};overflow-wrap:break-word;">` +
        `${escapeHtml(element.text)}</div>`
      );
    case "rectangle":
      return (
        `<div data-slai-el="${element.id}" data-slai-el-type="rectangle" ` +
        `data-slai-fill="${escapeAttr(element.fill)}" data-slai-stroke="${escapeAttr(element.stroke)}" ` +
        `style="${position}background:${escapeAttr(element.fill)};border:2px solid ${escapeAttr(element.stroke)};"></div>`
      );
    case "ellipse":
      return (
        `<div data-slai-el="${element.id}" data-slai-el-type="ellipse" ` +
        `data-slai-fill="${escapeAttr(element.fill)}" data-slai-stroke="${escapeAttr(element.stroke)}" ` +
        `style="${position}background:${escapeAttr(element.fill)};border:2px solid ${escapeAttr(element.stroke)};border-radius:50%;"></div>`
      );
    case "line":
      return (
        `<svg data-slai-el="${element.id}" data-slai-el-type="line" data-slai-stroke="${escapeAttr(element.stroke)}" ` +
        `style="${position}" viewBox="0 0 ${element.width} ${element.height}" preserveAspectRatio="none">` +
        `<line x1="0" y1="0" x2="${element.width}" y2="${element.height}" stroke="${escapeAttr(element.stroke)}" stroke-width="2" vector-effect="non-scaling-stroke" /></svg>`
      );
    case "image":
      return (
        `<img data-slai-el="${element.id}" data-slai-el-type="image" src="${escapeAttr(element.src)}" alt="${escapeAttr(element.alt)}" ` +
        `style="${position}object-fit:contain;" />`
      );
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeAttr(value: string): string {
  return escapeHtml(value).replaceAll('"', "&quot;");
}
