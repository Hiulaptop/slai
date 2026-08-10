import { z } from "zod";

import type { ElementDefinition, RenderNode } from "../element-registry";

export const tablePropsSchema = z
  .object({
    rows: z.number().int().min(1).max(50),
    columns: z.number().int().min(1).max(50),
    borderColor: z.string().max(64),
    borderWidth: z.number().min(0).max(20),
  })
  .strict();

export type TableProps = z.infer<typeof tablePropsSchema>;

export function tableSlotKey(row: number, column: number): string {
  return `r${row}c${column}`;
}

// Only table-cell children, one per occupied grid slot; a table descendant
// is intentionally not listed here (see table-cell.ts) so nested tables are
// rejected by the graph validator in the first release.
export const tableElement: ElementDefinition<TableProps> = {
  type: "table",
  schemaVersion: 1,
  propsSchema: tablePropsSchema,
  container: true,
  childPolicy: {
    slots: [{ slotKey: (slotKey) => /^r\d+c\d+$/.test(slotKey), allowedTypes: ["table-cell"], maxCount: 1 }],
  },
  createDefaults: () => ({ rows: 2, columns: 2, borderColor: "#d8d5cb", borderWidth: 1 }),
  render(context, node): RenderNode {
    const { props } = node;
    const cellsBySlot = new Map(node.children.map((child) => [child.slotKey, child.element]));
    const rows: RenderNode[] = [];
    for (let row = 0; row < props.rows; row += 1) {
      const cells: RenderNode[] = [];
      for (let column = 0; column < props.columns; column += 1) {
        const cell = cellsBySlot.get(tableSlotKey(row, column));
        if (cell) cells.push(context.renderChild(cell));
      }
      rows.push({ tag: "tr", children: cells });
    }
    return {
      tag: "table",
      style: { "border-collapse": "collapse", width: "100%", height: "100%", border: `${props.borderWidth}px solid ${props.borderColor}` },
      children: [{ tag: "tbody", children: rows }],
    };
  },
};
