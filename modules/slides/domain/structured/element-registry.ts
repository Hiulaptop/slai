import type { ZodType } from "zod";

import { SlideError } from "../slide.errors";
import type { ElementNode, Geometry } from "./types";

export interface ChildSlotRule {
  // Exact slot key (e.g. a single named slot) or a predicate for dynamically
  // sized containers (e.g. a table's `r{row}c{column}` grid, which has no
  // fixed slot count and must not be enumerated up front).
  slotKey: string | ((slotKey: string) => boolean);
  allowedTypes: string[] | "any";
  maxCount?: number;
}

export interface ChildPolicy {
  slots: ChildSlotRule[];
}

export function slotMatches(rule: ChildSlotRule, slotKey: string): boolean {
  return typeof rule.slotKey === "string" ? rule.slotKey === slotKey : rule.slotKey(slotKey);
}

// Passed to every definition's render(). Container definitions (table,
// table-cell) call `renderChild` to recursively render their own children
// through the registry rather than importing the registry singleton
// themselves, keeping definitions decoupled from how the registry is wired.
// Animation is applied uniformly to every node's output by the top-level
// renderer, not through this context, so definitions never special-case it.
export interface RenderContext {
  readonly animationRegistryVersion: number;
  renderChild(node: ElementNode): RenderNode;
}

// A minimal, portable, escaped-HTML-AST-like shape. Definitions build this
// instead of DOM nodes so rendering works identically in Node (server
// preview/download) and the browser (editor canvas) without `DOMParser` or
// any other browser-only API - see modules/slides/domain/structured/render.ts.
export interface RenderNode {
  tag: string;
  attrs?: Record<string, string>;
  style?: Record<string, string | number>;
  text?: string;
  children?: RenderNode[];
}

export interface ElementDefinition<TProps = unknown> {
  type: string;
  schemaVersion: number;
  propsSchema: ZodType<TProps>;
  container: boolean;
  childPolicy?: ChildPolicy;
  createDefaults(): TProps;
  render(context: RenderContext, node: ElementNode & { props: TProps }): RenderNode;
}

type AnyElementDefinition = ElementDefinition<unknown>;

function registryKey(type: string, schemaVersion: number): string {
  return `${type}@${schemaVersion}`;
}

export class ElementRegistry {
  private readonly definitions = new Map<string, AnyElementDefinition>();

  register<TProps>(definition: ElementDefinition<TProps>): void {
    const key = registryKey(definition.type, definition.schemaVersion);
    if (this.definitions.has(key)) {
      throw new Error(`Element definition already registered: ${key}`);
    }
    this.definitions.set(key, definition as AnyElementDefinition);
  }

  find(type: string, schemaVersion: number): AnyElementDefinition | null {
    return this.definitions.get(registryKey(type, schemaVersion)) ?? null;
  }

  require(type: string, schemaVersion: number): AnyElementDefinition {
    const definition = this.find(type, schemaVersion);
    if (!definition) {
      throw new SlideError("INVALID_INPUT", `Unsupported element type/version: ${type}@${schemaVersion}`);
    }
    return definition;
  }

  createDefaults(type: string, schemaVersion: number): unknown {
    return this.require(type, schemaVersion).createDefaults();
  }

  validateProps(type: string, schemaVersion: number, props: unknown): unknown {
    const definition = this.require(type, schemaVersion);
    const result = definition.propsSchema.safeParse(props);
    if (!result.success) {
      throw new SlideError("INVALID_INPUT", `Invalid properties for ${type}@${schemaVersion}: ${result.error.issues[0]?.message ?? "invalid"}`);
    }
    return result.data;
  }

  isContainer(type: string, schemaVersion: number): boolean {
    return this.require(type, schemaVersion).container;
  }

  childPolicy(type: string, schemaVersion: number): ChildPolicy | undefined {
    return this.require(type, schemaVersion).childPolicy;
  }

  render(animationRegistryVersion: number, node: ElementNode): RenderNode {
    const context: RenderContext = {
      animationRegistryVersion,
      renderChild: (child) => this.render(animationRegistryVersion, child),
    };
    const definition = this.require(node.type, node.schemaVersion);
    return definition.render(context, node as ElementNode & { props: unknown });
  }
}

export function assertGeometry(geometry: Geometry): void {
  const values = [geometry.x, geometry.y, geometry.width, geometry.height, geometry.zIndex];
  for (const value of values) {
    if (value !== null && (!Number.isFinite(value) || Number.isNaN(value))) {
      throw new SlideError("INVALID_INPUT", "Element geometry must be finite numbers or null");
    }
  }
  if (geometry.width !== null && geometry.width < 0) throw new SlideError("INVALID_INPUT", "Element width cannot be negative");
  if (geometry.height !== null && geometry.height < 0) throw new SlideError("INVALID_INPUT", "Element height cannot be negative");
}

export const elementRegistry = new ElementRegistry();
