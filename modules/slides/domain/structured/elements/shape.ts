import { z } from "zod";

import type { ElementDefinition, RenderNode } from "../element-registry";

export const shapePropsSchema = z
  .object({
    shapeType: z.enum(["rectangle", "ellipse", "line"]),
    fill: z.string().max(64),
    stroke: z.string().max(64),
    strokeWidth: z.number().min(0).max(64),
  })
  .strict();

export type ShapeProps = z.infer<typeof shapePropsSchema>;

export const shapeElement: ElementDefinition<ShapeProps> = {
  type: "shape",
  schemaVersion: 1,
  propsSchema: shapePropsSchema,
  container: false,
  createDefaults: () => ({ shapeType: "rectangle", fill: "#2448d8", stroke: "#171713", strokeWidth: 2 }),
  render(_context, node): RenderNode {
    const { props, geometry } = node;
    if (props.shapeType === "line") {
      const width = geometry.width ?? 0;
      const height = geometry.height ?? 0;
      return {
        tag: "svg",
        attrs: { viewBox: `0 0 ${width} ${height}`, preserveAspectRatio: "none" },
        children: [
          {
            tag: "line",
            attrs: {
              x1: "0",
              y1: "0",
              x2: String(width),
              y2: String(height),
              stroke: props.stroke,
              "stroke-width": String(props.strokeWidth),
            },
          },
        ],
      };
    }
    return {
      tag: "div",
      style: {
        background: props.fill,
        border: `${props.strokeWidth}px solid ${props.stroke}`,
        "border-radius": props.shapeType === "ellipse" ? "50%" : "0",
      },
    };
  },
};
