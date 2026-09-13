"use client";

// A curated, fixed block list - not GrapesJS's generic webpage-builder
// defaults - so every offered block is already representable within
// modules/slides/domain/structured/sanitize.ts's allow-list. Notably, no
// `<img>` block and no `<svg>`/`<rect>` block: sanitize-html's default tag
// list (which the sanitizer extends, never replaces) does not include
// `img`, and while `svg`/`rect` are in the extended tag list, `rect` has no
// entry in the sanitizer's `allowedAttributes` map, so its `width`/`height`/
// `fill` attributes are stripped on save - the "Image placeholder" block
// below uses a plain styled `<div>` instead, since `style` is allowed on
// every tag.
interface CanvasBlock {
  id: string;
  label: string;
  content: string;
}

const BLOCKS: CanvasBlock[] = [
  { id: "text", label: "Text", content: "<p>New text</p>" },
  { id: "heading", label: "Heading", content: "<h2>New heading</h2>" },
  {
    id: "image-placeholder",
    label: "Image placeholder",
    content: '<div style="width:200px;height:120px;background:#e5e5e5"></div>',
  },
  {
    id: "row",
    label: "Container / Row",
    content: '<div style="display:flex;gap:12px"><div>Column</div><div>Column</div></div>',
  },
];

export interface CanvasBlockPaletteProps {
  onAddBlock(content: string): void;
  disabled?: boolean;
}

export function CanvasBlockPalette({ onAddBlock, disabled = false }: CanvasBlockPaletteProps) {
  return (
    <nav aria-label="Block palette" className="flex flex-col gap-1.5 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-2">
      {BLOCKS.map((block) => (
        <button
          className="rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-left text-sm hover:border-[var(--accent)]"
          disabled={disabled}
          key={block.id}
          onClick={() => onAddBlock(block.content)}
          type="button"
        >
          {block.label}
        </button>
      ))}
    </nav>
  );
}
