import { elementRegistry } from "../element-registry";
import { imageElement } from "./image";
import { shapeElement } from "./shape";
import { tableElement } from "./table";
import { tableCellElement } from "./table-cell";
import { textElement } from "./text";

// Side-effect registration, run once at module load. Import this module
// (not element-registry.ts directly) wherever a "ready" registry with the
// initial element set is needed - importing element-registry.ts alone gets
// an empty registry.
elementRegistry.register(textElement);
elementRegistry.register(shapeElement);
elementRegistry.register(imageElement);
elementRegistry.register(tableElement);
elementRegistry.register(tableCellElement);

export { elementRegistry } from "../element-registry";
export * from "./image";
export * from "./shape";
export * from "./table";
export * from "./table-cell";
export * from "./text";
