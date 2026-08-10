import { z } from "zod";

import type { ElementDefinition, RenderNode } from "../element-registry";

export const TEXT_STYLE_TYPES = ["display", "heading", "subheading", "body", "caption"] as const;
export type TextStyleType = (typeof TEXT_STYLE_TYPES)[number];

export const TEXT_STYLE_PRESETS: Record<TextStyleType, { fontSize: number; fontWeight: number }> = {
  display: { fontSize: 48, fontWeight: 700 },
  heading: { fontSize: 32, fontWeight: 700 },
  subheading: { fontSize: 22, fontWeight: 600 },
  body: { fontSize: 18, fontWeight: 400 },
  caption: { fontSize: 14, fontWeight: 400 },
};

export const textPropsSchema = z
  .object({
    text: z.string().max(10_000),
    styleType: z.enum(TEXT_STYLE_TYPES),
    fontSize: z.number().positive().max(400),
    fontWeight: z.number().int().min(100).max(900),
    color: z.string().min(1).max(64),
    backgroundColor: z.string().max(64).nullable(),
    align: z.enum(["left", "center", "right"]),
    bold: z.boolean(),
    italic: z.boolean(),
    underline: z.boolean(),
    list: z.enum(["none", "bullet"]),
  })
  .strict();

export type TextProps = z.infer<typeof textPropsSchema>;

// Animation is a cross-cutting concern applied uniformly to every element's
// RenderNode by the top-level renderer (see ../render.ts), not by individual
// definitions - so `render` here never touches `node.animation`.
export const textElement: ElementDefinition<TextProps> = {
  type: "text",
  schemaVersion: 1,
  propsSchema: textPropsSchema,
  container: false,
  createDefaults: () => ({
    text: "Text",
    styleType: "body",
    fontSize: TEXT_STYLE_PRESETS.body.fontSize,
    fontWeight: TEXT_STYLE_PRESETS.body.fontWeight,
    color: "#171713",
    backgroundColor: null,
    align: "left",
    bold: false,
    italic: false,
    underline: false,
    list: "none",
  }),
  render(_context, node): RenderNode {
    const { props } = node;
    const style: Record<string, string | number> = {
      "font-size": `${props.fontSize}px`,
      "font-weight": props.bold ? 700 : props.fontWeight,
      "font-style": props.italic ? "italic" : "normal",
      "text-decoration": props.underline ? "underline" : "none",
      "text-align": props.align,
      color: props.color,
      background: props.backgroundColor ?? "transparent",
    };
    const lines = props.text.split("\n").filter((line) => line.length > 0);
    const content: RenderNode =
      props.list === "bullet"
        ? { tag: "ul", children: lines.map((line) => ({ tag: "li", text: line })) }
        : { tag: "span", text: props.text };
    return { tag: "div", style, children: [content] };
  },
};
