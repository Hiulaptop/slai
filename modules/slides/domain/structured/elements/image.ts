import { z } from "zod";

import type { ElementDefinition, RenderNode } from "../element-registry";

const ALLOWED_IMAGE_SRC = /^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=]+$/i;

export const imagePropsSchema = z
  .object({
    src: z.string().max(10_000_000).regex(ALLOWED_IMAGE_SRC, "Image src must be a data: URL of an allowed image type"),
    alt: z.string().max(500),
  })
  .strict();

export type ImageProps = z.infer<typeof imagePropsSchema>;

export const imageElement: ElementDefinition<ImageProps> = {
  type: "image",
  schemaVersion: 1,
  propsSchema: imagePropsSchema,
  container: false,
  createDefaults: () => ({ src: "", alt: "" }),
  render(_context, node): RenderNode {
    return {
      tag: "img",
      attrs: { src: node.props.src, alt: node.props.alt },
      style: { "object-fit": "contain" },
    };
  },
};
