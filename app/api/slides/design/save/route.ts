import { NextResponse } from "next/server";
import { authenticateRequest } from "@/modules/auth/presentation/authenticate-request";
import { designSaveSchema } from "@/modules/slides/domain/slide.schemas";
import { slideService } from "@/modules/slides/infrastructure/slides";
import { presentationResponse, readJson, slideErrorResponse } from "@/modules/slides/presentation/route-helpers";

export async function PATCH(request: Request) {
  try {
    const user = await authenticateRequest(request);
    const input = designSaveSchema.parse(await readJson(request));
    return NextResponse.json(presentationResponse(await slideService.saveDesign(user.id, input)));
  } catch (error) {
    return slideErrorResponse(error);
  }
}
