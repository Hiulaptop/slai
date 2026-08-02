import { NextResponse } from "next/server";
import { authenticateRequest } from "@/modules/auth/presentation/authenticate-request";
import { generationIdSchema, slideUndoSchema } from "@/modules/slides/domain/slide.schemas";
import { slideService } from "@/modules/slides/infrastructure/slides";
import { presentationResponse, readJson, slideErrorResponse } from "@/modules/slides/presentation/route-helpers";

export async function POST(request: Request, context: { params: Promise<{ generationId: string }> }) {
  try {
    const user = await authenticateRequest(request);
    const { generationId } = await context.params;
    const payload = await readJson(request);
    const input = slideUndoSchema.parse(payload);
    return NextResponse.json(presentationResponse(await slideService.undo(user.id, generationIdSchema.parse(generationId), input.slideNumber)));
  } catch (error) { return slideErrorResponse(error); }
}
