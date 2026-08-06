import { NextResponse } from "next/server";
import { authenticateRequest } from "@/modules/auth/presentation/authenticate-request";
import { designBootstrapSchema } from "@/modules/slides/domain/slide.schemas";
import { slideService } from "@/modules/slides/infrastructure/slides";
import { presentationResponse, readJson, slideErrorResponse } from "@/modules/slides/presentation/route-helpers";

export async function POST(request: Request) {
  try {
    const user = await authenticateRequest(request);
    const input = designBootstrapSchema.parse(await readJson(request));
    return NextResponse.json(presentationResponse(await slideService.bootstrapDesign(user.id, input)), { status: 201 });
  } catch (error) {
    return slideErrorResponse(error);
  }
}
