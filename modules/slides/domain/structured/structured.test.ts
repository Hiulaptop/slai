import { describe, expect, it } from "vitest";
import { z } from "zod";

import { animationRegistry, CURRENT_ANIMATION_REGISTRY_VERSION } from "./animation-registry";
import { elementRegistry } from "./elements";
import { tableSlotKey } from "./elements/table";
import { validateStructuredCommand } from "./graph-validator";
import type { ElementChildCommand, ElementNodeCommand, SlideCommand } from "./types";

function node(overrides: Partial<ElementNodeCommand> & Pick<ElementNodeCommand, "id" | "type">): ElementNodeCommand {
  return {
    schemaVersion: 1,
    geometry: { x: 0, y: 0, width: 100, height: 40, zIndex: 0 },
    props: elementRegistry.createDefaults(overrides.type, 1),
    animation: null,
    ...overrides,
  };
}

function slide(elementIds: string[], overrides: Partial<SlideCommand> = {}): SlideCommand {
  return { number: 1, width: 960, height: 540, props: {}, topLevelElementIds: elementIds, ...overrides };
}

describe("element registry", () => {
  it("registers the five initial element definitions with usable defaults", () => {
    // image has no sensible non-empty default: an image element is only ever
    // created from an already-picked file (mirroring the design-editor
    // canvas's own image tool), never as a blank placeholder, so its
    // createDefaults() is intentionally not schema-valid on its own.
    for (const type of ["text", "shape", "table", "table-cell"]) {
      const definition = elementRegistry.require(type, 1);
      expect(definition.type).toBe(type);
      expect(() => elementRegistry.validateProps(type, 1, definition.createDefaults())).not.toThrow();
    }
    expect(elementRegistry.require("image", 1).type).toBe("image");
  });

  it("rejects an unregistered type/version pair", () => {
    expect(() => elementRegistry.require("chart", 1)).toThrow(/Unsupported element type\/version/);
    expect(() => elementRegistry.require("text", 99)).toThrow(/Unsupported element type\/version/);
  });

  it("rejects props that fail the registered schema", () => {
    expect(() => elementRegistry.validateProps("text", 1, { text: "x" })).toThrow(/Invalid properties/);
  });

  it("supports future type registration without changing the type column schema - adding a new definition doesn't require touching existing ones", () => {
    const before = elementRegistry.require("text", 1);
    expect(before).toBeDefined();
    // Registering a throwaway type at runtime proves the registry has no
    // hardcoded type list to update - it's purely additive.
    elementRegistry.register({
      type: "__test_future_type__",
      schemaVersion: 1,
      propsSchema: z.object({}).strict(),
      container: false,
      createDefaults: () => ({}),
      render: () => ({ tag: "div" }),
    });
    expect(elementRegistry.require("__test_future_type__", 1)).toBeDefined();
  });
});

describe("animation registry", () => {
  it("resolves a supported animation with validated timing", () => {
    const output = animationRegistry.resolve(CURRENT_ANIMATION_REGISTRY_VERSION, "fade", { durationMs: 300, delayMs: 100 });
    expect(output.className).toBe("slai-anim-fade");
    expect(output.keyframesCss).toContain("@keyframes");
    expect(output.durationMs).toBe(300);
  });

  it("rejects an unavailable registry version", () => {
    expect(() => animationRegistry.require(999, "fade")).toThrow(/Unsupported animation registry version/);
  });

  it("rejects an unknown animation key", () => {
    expect(() => animationRegistry.require(CURRENT_ANIMATION_REGISTRY_VERSION, "spin")).toThrow(/Unsupported animation key/);
  });

  it("rejects invalid options instead of silently substituting defaults", () => {
    expect(() => animationRegistry.resolve(CURRENT_ANIMATION_REGISTRY_VERSION, "fade", { durationMs: -5 })).toThrow(/Invalid options/);
  });
});

// Self-nesting throwaway container, registered once for the structural
// (cycle/depth) tests below - none of the five real element types can nest
// more than two levels deep (table -> table-cell -> leaf), so exercising the
// generic depth/cycle guards (which exist for future container types)
// needs a type that can actually contain itself.
elementRegistry.register({
  type: "__test_group__",
  schemaVersion: 1,
  propsSchema: z.object({}).strict(),
  container: true,
  childPolicy: { slots: [{ slotKey: "content", allowedTypes: ["__test_group__", "text"] }] },
  createDefaults: () => ({}),
  render: () => ({ tag: "div" }),
});

describe("graph validator", () => {
  it("accepts a valid single-element slide", () => {
    const nodes = [node({ id: "n1", type: "text" })];
    expect(() => validateStructuredCommand(nodes, [], [slide(["n1"])])).not.toThrow();
  });

  it("accepts valid nested content (text inside a table cell inside a table)", () => {
    const nodes = [
      node({ id: "table", type: "table", props: { rows: 1, columns: 1, borderColor: "#000", borderWidth: 1 } }),
      node({ id: "cell", type: "table-cell" }),
      node({ id: "text", type: "text" }),
    ];
    const children: ElementChildCommand[] = [
      { parentId: "table", childId: "cell", slotKey: tableSlotKey(0, 0), orderIndex: 0 },
      { parentId: "cell", childId: "text", slotKey: "content", orderIndex: 0 },
    ];
    expect(() => validateStructuredCommand(nodes, children, [slide(["table"])])).not.toThrow();
  });

  it("rejects a nested table beneath a table-cell", () => {
    const nodes = [
      node({ id: "outer", type: "table", props: { rows: 1, columns: 1, borderColor: "#000", borderWidth: 1 } }),
      node({ id: "cell", type: "table-cell" }),
      node({ id: "inner", type: "table", props: { rows: 1, columns: 1, borderColor: "#000", borderWidth: 1 } }),
    ];
    const children: ElementChildCommand[] = [
      { parentId: "outer", childId: "cell", slotKey: tableSlotKey(0, 0), orderIndex: 0 },
      { parentId: "cell", childId: "inner", slotKey: "content", orderIndex: 0 },
    ];
    expect(() => validateStructuredCommand(nodes, children, [slide(["outer"])])).toThrow(/not permitted/);
  });

  it("rejects overlapping/out-of-policy table cell slots", () => {
    const nodes = [
      node({ id: "table", type: "table", props: { rows: 1, columns: 1, borderColor: "#000", borderWidth: 1 } }),
      node({ id: "cellA", type: "table-cell" }),
      node({ id: "cellB", type: "table-cell" }),
    ];
    const children: ElementChildCommand[] = [
      { parentId: "table", childId: "cellA", slotKey: tableSlotKey(0, 0), orderIndex: 0 },
      { parentId: "table", childId: "cellB", slotKey: tableSlotKey(0, 0), orderIndex: 1 },
    ];
    expect(() => validateStructuredCommand(nodes, children, [slide(["table"])])).toThrow(/Duplicate child slot/);
  });

  it("rejects a cycle", () => {
    const nodes = [node({ id: "group1", type: "__test_group__" }), node({ id: "group2", type: "__test_group__" })];
    const children: ElementChildCommand[] = [
      { parentId: "group1", childId: "group2", slotKey: "content", orderIndex: 0 },
      { parentId: "group2", childId: "group1", slotKey: "content", orderIndex: 0 },
    ];
    expect(() => validateStructuredCommand(nodes, children, [slide(["group1"])])).toThrow(/cycle/);
  });

  it("rejects duplicate node IDs", () => {
    const nodes = [node({ id: "n1", type: "text" }), node({ id: "n1", type: "shape" })];
    expect(() => validateStructuredCommand(nodes, [], [slide(["n1"])])).toThrow(/Duplicate element node ID/);
  });

  it("rejects an unreachable node", () => {
    const nodes = [node({ id: "n1", type: "text" }), node({ id: "orphan", type: "text" })];
    expect(() => validateStructuredCommand(nodes, [], [slide(["n1"])])).toThrow(/not reachable/);
  });

  it("rejects a node referenced by more than one parent", () => {
    const nodes = [node({ id: "cell1", type: "table-cell" }), node({ id: "cell2", type: "table-cell" }), node({ id: "text", type: "text" })];
    const children: ElementChildCommand[] = [
      { parentId: "cell1", childId: "text", slotKey: "content", orderIndex: 0 },
      { parentId: "cell2", childId: "text", slotKey: "content", orderIndex: 0 },
    ];
    expect(() => validateStructuredCommand(nodes, children, [slide(["cell1", "cell2"])])).toThrow(/more than one parent/);
  });

  it("rejects nesting beyond the configured maximum depth", () => {
    // group -> group -> group -> group -> group -> text = 5 edges, exceeds MAX_ELEMENT_DEPTH (4)
    const nodes = ["c0", "c1", "c2", "c3", "c4", "leaf"].map((id) => node({ id, type: id === "leaf" ? "text" : "__test_group__" }));
    const children: ElementChildCommand[] = [
      { parentId: "c0", childId: "c1", slotKey: "content", orderIndex: 0 },
      { parentId: "c1", childId: "c2", slotKey: "content", orderIndex: 0 },
      { parentId: "c2", childId: "c3", slotKey: "content", orderIndex: 0 },
      { parentId: "c3", childId: "c4", slotKey: "content", orderIndex: 0 },
      { parentId: "c4", childId: "leaf", slotKey: "content", orderIndex: 0 },
    ];
    expect(() => validateStructuredCommand(nodes, children, [slide(["c0"])])).toThrow(/exceeds the maximum depth/);
  });

  it("accepts nesting exactly at the maximum depth", () => {
    const nodes = ["c0", "c1", "c2", "c3", "leaf"].map((id) => node({ id, type: id === "leaf" ? "text" : "__test_group__" }));
    const children: ElementChildCommand[] = [
      { parentId: "c0", childId: "c1", slotKey: "content", orderIndex: 0 },
      { parentId: "c1", childId: "c2", slotKey: "content", orderIndex: 0 },
      { parentId: "c2", childId: "c3", slotKey: "content", orderIndex: 0 },
      { parentId: "c3", childId: "leaf", slotKey: "content", orderIndex: 0 },
    ];
    expect(() => validateStructuredCommand(nodes, children, [slide(["c0"])])).not.toThrow();
  });

  it("rejects non-contiguous or duplicate slide numbers", () => {
    const nodes = [node({ id: "n1", type: "text" }), node({ id: "n2", type: "text" })];
    expect(() =>
      validateStructuredCommand(nodes, [], [slide(["n1"], { number: 1 }), slide(["n2"], { number: 3 })]),
    ).toThrow(/contiguous/);
  });

  it("rejects a command exceeding the slide count limit", () => {
    const nodes = [node({ id: "n1", type: "text" })];
    const slides = Array.from({ length: 51 }, (_, index) => slide(["n1"], { number: index + 1 }));
    expect(() => validateStructuredCommand(nodes, [], slides)).toThrow(/cannot exceed/);
  });

  it("rejects a leaf element given children it cannot contain", () => {
    const nodes = [node({ id: "text1", type: "text" }), node({ id: "text2", type: "text" })];
    const children: ElementChildCommand[] = [{ parentId: "text1", childId: "text2", slotKey: "content", orderIndex: 0 }];
    expect(() => validateStructuredCommand(nodes, children, [slide(["text1"])])).toThrow(/does not accept children/);
  });
});
