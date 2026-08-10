import { z } from "zod";

import type { ElementDefinition, RenderNode } from "../element-registry";

export const tableCellPropsSchema = z
  .object({
    row: z.number().int().min(0),
    column: z.number().int().min(0),
    rowSpan: z.number().int().min(1).max(50),
    columnSpan: z.number().int().min(1).max(50),
    padding: z.number().min(0).max(200),
    backgroundColor: z.string().max(64).nullable(),
  })
  .strict();

export type TableCellProps = z.infer<typeof tableCellPropsSchema>;

// First release: a cell may contain text/shape/image content but never a
// nested table, per design.md's "Treat table and cell as registered
// composite element types" decision - the registry enforces this, not a
// database constraint, so a later change can lift it without a migration.
export const tableCellElement: ElementDefinition<TableCellProps> = {
  type: "table-cell",
  schemaVersion: 1,
  propsSchema: tableCellPropsSchema,
  container: true,
  childPolicy: {
    slots: [{ slotKey: "content", allowedTypes: ["text", "shape", "image"] }],
  },
  createDefaults: () => ({ row: 0, column: 0, rowSpan: 1, columnSpan: 1, padding: 8, backgroundColor: null }),
  render(context, node): RenderNode {
    const { props } = node;
    return {
      tag: "td",
      attrs: { rowspan: String(props.rowSpan), colspan: String(props.columnSpan) },
      style: { padding: `${props.padding}px`, background: props.backgroundColor ?? "transparent" },
      children: node.children
        .slice()
        .sort((a, b) => a.orderIndex - b.orderIndex)
        .map((child) => context.renderChild(child.element)),
    };
  },
};
