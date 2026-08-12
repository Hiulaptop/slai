import { describe, expect, it } from "vitest";

import { flattenWireSlides } from "./compose";
import { validateStructuredCommand } from "./graph-validator";
import { resolveTailwindTextClasses, resolveTextElementTailwindClasses } from "./tailwind-adapter";
import { TAILWIND_DEFAULT_TEXT_COLORS } from "./tailwind-color-palette.generated";
import type { WireSlide } from "./compose";

// Resolved from the generated palette rather than hardcoded, so this test
// does not go stale whenever tailwind-color-palette.generated.ts is
// regenerated after a Tailwind upgrade - see tailwind-color-palette.drift.test.ts.
const RED_500 = TAILWIND_DEFAULT_TEXT_COLORS["text-red-500"];

function textProps(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    text: "Hello",
    styleType: "body",
    fontSize: "text-lg",
    fontWeight: 400,
    color: "text-red-500",
    backgroundColor: null,
    align: "left",
    bold: false,
    italic: false,
    underline: false,
    list: "none",
    ...overrides,
  };
}

describe("resolveTextElementTailwindClasses", () => {
  it("resolves a text element's fontSize and color classes to concrete values", () => {
    const resolved = resolveTextElementTailwindClasses("text", textProps(), "INVALID_INPUT") as Record<string, unknown>;
    expect(resolved.fontSize).toBe(18);
    expect(resolved.color).toBe(RED_500);
    expect(resolved.text).toBe("Hello"); // every other field passes through untouched
  });

  it("passes through an already-resolved numeric fontSize and raw color unchanged (editor-authored content)", () => {
    const resolved = resolveTextElementTailwindClasses("text", textProps({ fontSize: 24, color: "#123456" }), "INVALID_INPUT") as Record<string, unknown>;
    expect(resolved.fontSize).toBe(24);
    expect(resolved.color).toBe("#123456");
  });

  it("throws with the caller-supplied error code for an unresolvable class, and resolves nothing partially", () => {
    expect(() => resolveTextElementTailwindClasses("text", textProps({ fontSize: "text-not-a-real-class" }), "INVALID_MODEL_OUTPUT")).toThrowError(
      expect.objectContaining({ code: "INVALID_MODEL_OUTPUT" }),
    );
  });

  it("throws when a font-size field resolves to a color-kind class (wrong kind for the slot)", () => {
    expect(() => resolveTextElementTailwindClasses("text", textProps({ fontSize: "text-red-500" }), "INVALID_INPUT")).toThrow(/Unsupported Tailwind font-size class/);
  });

  it("leaves non-text elements and non-object props untouched", () => {
    expect(resolveTextElementTailwindClasses("shape", { fill: "text-red-500" }, "INVALID_INPUT")).toEqual({ fill: "text-red-500" });
    expect(resolveTextElementTailwindClasses("text", "not-an-object", "INVALID_INPUT")).toBe("not-an-object");
  });
});

describe("resolveTailwindTextClasses (whole-tree wrapper)", () => {
  it("resolves nested table-cell text content the same way as top-level text", () => {
    const slides: WireSlide[] = [
      {
        number: 1,
        width: 960,
        height: 540,
        elements: [
          {
            type: "table",
            geometry: { x: 0, y: 0, width: 400, height: 200, zIndex: 0 },
            props: { rows: 1, columns: 1, borderColor: "#000", borderWidth: 1 },
            children: [
              {
                slotKey: "r0c0",
                element: {
                  type: "table-cell",
                  props: { row: 0, column: 0, rowSpan: 1, columnSpan: 1, padding: 8, backgroundColor: null },
                  children: [{ slotKey: "content", element: { type: "text", props: textProps() } }],
                },
              },
            ],
          },
        ],
      },
    ];

    const [resolvedSlide] = resolveTailwindTextClasses(slides, "INVALID_INPUT");
    const cellText = resolvedSlide.elements[0].children![0].element.children![0].element;
    expect((cellText.props as Record<string, unknown>).fontSize).toBe(18);
    expect((cellText.props as Record<string, unknown>).color).toBe(RED_500);
  });
});

describe("flattenWireSlides wiring (compose.ts)", () => {
  const wireSlide: WireSlide = {
    number: 1,
    width: 960,
    height: 540,
    elements: [{ type: "text", geometry: { x: 0, y: 0, width: 200, height: 40, zIndex: 0 }, props: textProps() }],
  };

  it("resolves Tailwind classes and passes through to validateStructuredCommand unchanged in every other respect", () => {
    const flattened = flattenWireSlides([wireSlide], 1, "INVALID_INPUT");
    expect(flattened.nodes[0].props).toMatchObject({ fontSize: 18, color: RED_500, text: "Hello" });
    expect(() => validateStructuredCommand(flattened.nodes, flattened.children, flattened.slides)).not.toThrow();
  });

  it("fails with the caller's errorCode and never reaches validateStructuredCommand for an unresolvable class", () => {
    const badSlide: WireSlide = { ...wireSlide, elements: [{ ...wireSlide.elements[0], props: textProps({ color: "text-not-a-real-class" }) }] };
    expect(() => flattenWireSlides([badSlide], 1, "INVALID_MODEL_OUTPUT")).toThrowError(expect.objectContaining({ code: "INVALID_MODEL_OUTPUT" }));
  });
});
