const SLIDE_SELECTOR = ".slai-slide[data-slide-number]";
const VIEWPORT_CSS = `html,body{width:100%!important;height:100%!important;margin:0!important;overflow:hidden!important;overscroll-behavior:none!important}body{position:relative!important}.slai-slide{box-sizing:border-box!important;width:100%!important;height:100%!important;max-width:100%!important;max-height:100%!important;overflow:hidden!important;overscroll-behavior:none!important;position:relative!important}`;

export interface ExtractedSlide {
  number: number;
  srcDoc: string;
}

export function extractSlides(html: string): ExtractedSlide[] {
  const document = new DOMParser().parseFromString(html, "text/html");
  const slides = Array.from(document.querySelectorAll(SLIDE_SELECTOR));

  return slides.map((slide, index) => {
    const number = Number(slide.getAttribute("data-slide-number"));
    if (!Number.isInteger(number) || number < 1 || number !== index + 1) {
      throw new Error("Presentation contains invalid slide numbering");
    }

    return {
      number,
      srcDoc: buildSlideDocument(document, slide),
    };
  });
}

function buildSlideDocument(source: Document, slide: Element): string {
  const head = source.head.cloneNode(true) as HTMLHeadElement;
  head.querySelectorAll("script, base, meta[http-equiv='refresh']").forEach((node) => node.remove());

  const csp = source.createElement("meta");
  csp.httpEquiv = "Content-Security-Policy";
  csp.content = "script-src 'none'; object-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'";
  head.prepend(csp);

  const viewportStyle = source.createElement("style");
  viewportStyle.dataset.slaiViewport = "true";
  viewportStyle.textContent = VIEWPORT_CSS;
  head.append(viewportStyle);

  const body = source.body.cloneNode(true) as HTMLBodyElement;
  const selectedNumber = slide.getAttribute("data-slide-number");
  body.querySelectorAll(SLIDE_SELECTOR).forEach((candidate) => {
    if (candidate.getAttribute("data-slide-number") !== selectedNumber) candidate.remove();
  });
  body.querySelectorAll("script, iframe, object, embed, form").forEach((node) => node.remove());

  return `<!doctype html><html${serializeAttributes(source.documentElement)}>${head.outerHTML}${body.outerHTML}</html>`;
}

function serializeAttributes(element: Element): string {
  return Array.from(element.attributes)
    .map(({ name, value }) => ` ${name}="${escapeAttribute(value)}"`)
    .join("");
}

function escapeAttribute(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;");
}
