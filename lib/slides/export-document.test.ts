// @vitest-environment jsdom

import { describe, expect, it } from "vitest";

import { exportStandalonePresentation } from "./export-document";

const html = `<!doctype html><html><head><style>.slai-slide{height:100%}</style></head><body><div class="slai-slide" data-slide-number="1">One</div><div class="slai-slide" data-slide-number="2">Two</div></body></html>`;

describe("exportStandalonePresentation", () => {
  it("adds trusted controls and switches all exported slides", () => {
    const exported = exportStandalonePresentation(html);
    const frame = document.createElement("iframe");
    document.body.append(frame);
    const page = frame.contentDocument!;
    page.open();
    page.write(exported);
    page.close();
    const script = page.getElementById("slai-export-navigation-script")!;
    (frame.contentWindow as Window & { eval(code: string): unknown }).eval(script.textContent!);

    const slides = page.querySelectorAll(".slai-slide");
    const previous = page.querySelector<HTMLButtonElement>("[data-slai-export-previous]")!;
    const next = page.querySelector<HTMLButtonElement>("[data-slai-export-next]")!;
    expect(slides[0]).toHaveAttribute("data-slai-active", "true");
    expect(previous).toBeDisabled();

    next.click();
    expect(slides[0]).not.toHaveAttribute("data-slai-active");
    expect(slides[1]).toHaveAttribute("data-slai-active", "true");
    expect(next).toBeDisabled();
    frame.remove();
  });

  it("is idempotent when exporting an already exported document", () => {
    const exported = exportStandalonePresentation(exportStandalonePresentation(html));
    const document = new DOMParser().parseFromString(exported, "text/html");
    expect(document.querySelectorAll("#slai-export-navigation-style")).toHaveLength(1);
    expect(document.querySelectorAll("#slai-export-navigation-script")).toHaveLength(1);
    expect(document.querySelectorAll(".slai-export-nav")).toHaveLength(1);
  });
});
