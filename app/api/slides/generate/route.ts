import { NextResponse } from "next/server";
import { authenticateRequest } from "@/modules/auth/presentation/authenticate-request";
import { outlineSchema } from "@/modules/slides/domain/slide.schemas";
import { slideService } from "@/modules/slides/infrastructure/slides";
import { parseJsonText, presentationResponse, readFormData, requireFile, requireText, slideErrorResponse } from "@/modules/slides/presentation/route-helpers";

export async function POST(request: Request) {
  try {
    const user = await authenticateRequest(request);
    const form = await readFormData(request);
    const outline = outlineSchema.parse(parseJsonText(requireText(form, "outline")));
    const result = await slideService.generate(user.id, requireFile(form, "report"), requireFile(form, "template"), outline, request.signal);
    return NextResponse.json(presentationResponse(result), { status: 201 });
  } catch (error) { return slideErrorResponse(error); }
}
