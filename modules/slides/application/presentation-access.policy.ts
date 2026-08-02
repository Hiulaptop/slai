import { SlideError } from "../domain/slide.errors";
import type {
  PresentationAccessRecord,
  SlideRepository,
} from "./slide.ports";

export type PresentationOperation = "read" | "mutate" | "delete";

export class PresentationAccessPolicy {
  constructor(private readonly repository: SlideRepository) {}

  async require(
    id: string,
    userId: string,
    operation: PresentationOperation,
  ): Promise<PresentationAccessRecord> {
    const presentation = await this.repository.findOwned(id, userId);

    if (!presentation) {
      throw new SlideError("NOT_FOUND", "Presentation not found");
    }

    if (
      operation === "mutate" &&
      (presentation.status !== "COMPLETED" ||
        !presentation.htmlContent ||
        presentation.currentRevisionNumber === null)
    ) {
      throw new SlideError("CONFLICT", "Presentation is not complete");
    }

    if (operation === "delete" && presentation.status === "PROCESSING") {
      throw new SlideError("CONFLICT", "Presentation is processing");
    }

    return presentation;
  }
}
