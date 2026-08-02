import { NextResponse } from "next/server";

import { authenticateRequest } from "@/modules/auth/presentation/authenticate-request";
import { generationIdSchema } from "@/modules/slides/domain/slide.schemas";
import { slideService } from "@/modules/slides/infrastructure/slides";
import {
  presentationResponse,
  slideErrorResponse,
} from "@/modules/slides/presentation/route-helpers";

type RouteContext = { params: Promise<{ generationId: string }> };

export async function GET(request: Request, context: RouteContext) {
  try {
    const user = await authenticateRequest(request);
    const { generationId } = await context.params;
    return NextResponse.json(
      presentationResponse(
        await slideService.detail(
          user.id,
          generationIdSchema.parse(generationId),
        ),
      ),
    );
  } catch (error) {
    return slideErrorResponse(error);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const user = await authenticateRequest(request);
    const { generationId } = await context.params;
    await slideService.delete(
      user.id,
      generationIdSchema.parse(generationId),
    );
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return slideErrorResponse(error);
  }
}
