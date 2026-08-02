import { NextResponse } from "next/server";
import { authenticateRequest } from "@/modules/auth/presentation/authenticate-request";
import { generationIdSchema } from "@/modules/slides/domain/slide.schemas";
import { slideService } from "@/modules/slides/infrastructure/slides";
import { presentationResponse, slideErrorResponse } from "@/modules/slides/presentation/route-helpers";

export async function POST(request: Request, context: { params: Promise<{ generationId: string }> }) {
  try {
    const user = await authenticateRequest(request);
    const { generationId } = await context.params;
    return NextResponse.json(presentationResponse(await slideService.undo(user.id, generationIdSchema.parse(generationId))));
  } catch (error) { return slideErrorResponse(error); }
}
