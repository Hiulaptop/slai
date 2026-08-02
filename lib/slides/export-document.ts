const SLIDE_SELECTOR = ".slai-slide[data-slide-number]";
const EXPORT_STYLE_ID = "slai-export-navigation-style";
const EXPORT_SCRIPT_ID = "slai-export-navigation-script";

const EXPORT_CSS = `
${SLIDE_SELECTOR}{display:none!important}
${SLIDE_SELECTOR}[data-slai-active="true"]{display:block!important}
.slai-export-nav{position:fixed;z-index:2147483647;right:20px;bottom:20px;display:flex;align-items:center;gap:8px;padding:8px;border:1px solid rgba(255,255,255,.28);border-radius:999px;background:rgba(17,24,39,.88);box-shadow:0 8px 30px rgba(0,0,0,.28);color:#fff;font:600 14px/1 system-ui,sans-serif}
.slai-export-nav button{appearance:none;border:1px solid rgba(255,255,255,.3);border-radius:999px;background:#fff;color:#111827;padding:9px 14px;font:inherit;cursor:pointer}
.slai-export-nav button:disabled{cursor:not-allowed;opacity:.42}
.slai-export-counter{min-width:72px;text-align:center}
@media print{.slai-export-nav{display:none!important}${SLIDE_SELECTOR}{display:block!important;break-after:page}}
`;

const EXPORT_SCRIPT = `(() => {
  const slides = Array.from(document.querySelectorAll('${SLIDE_SELECTOR}'));
  const previous = document.querySelector('[data-slai-export-previous]');
  const next = document.querySelector('[data-slai-export-next]');
  const counter = document.querySelector('[data-slai-export-counter]');
  let index = 0;
  function show(nextIndex) {
    if (nextIndex < 0 || nextIndex >= slides.length) return;
    index = nextIndex;
    slides.forEach((slide, slideIndex) => {
      if (slideIndex === index) slide.setAttribute('data-slai-active', 'true');
      else slide.removeAttribute('data-slai-active');
    });
    previous.disabled = index === 0;
    next.disabled = index === slides.length - 1;
    counter.textContent = (index + 1) + ' / ' + slides.length;
  }
  previous.addEventListener('click', () => show(index - 1));
  next.addEventListener('click', () => show(index + 1));
  window.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowLeft') show(index - 1);
    if (event.key === 'ArrowRight') show(index + 1);
  });
  show(0);
})();`;

export function exportStandalonePresentation(html: string): string {
  const document = new DOMParser().parseFromString(html, "text/html");
  const slides = Array.from(document.querySelectorAll(SLIDE_SELECTOR));
  if (!slides.length) throw new Error("Presentation does not contain slides");

  document.getElementById(EXPORT_STYLE_ID)?.remove();
  document.getElementById(EXPORT_SCRIPT_ID)?.remove();
  document.querySelector(".slai-export-nav")?.remove();

  const style = document.createElement("style");
  style.id = EXPORT_STYLE_ID;
  style.textContent = EXPORT_CSS;
  document.head.append(style);

  const navigation = document.createElement("nav");
  navigation.className = "slai-export-nav";
  navigation.setAttribute("aria-label", "Slide navigation");
  navigation.innerHTML = `<button type="button" data-slai-export-previous aria-label="Previous slide">Previous</button><span class="slai-export-counter" data-slai-export-counter aria-live="polite"></span><button type="button" data-slai-export-next aria-label="Next slide">Next</button>`;
  document.body.append(navigation);

  const script = document.createElement("script");
  script.id = EXPORT_SCRIPT_ID;
  script.textContent = EXPORT_SCRIPT;
  document.body.append(script);

  return `<!doctype html>${document.documentElement.outerHTML}`;
}
