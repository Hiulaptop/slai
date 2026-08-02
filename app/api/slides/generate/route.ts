import { NextResponse } from "next/server";
import { authenticateRequest } from "@/modules/auth/presentation/authenticate-request";
import { approvedOutlineSchema, creationMetadataSchema } from "@/modules/slides/domain/slide.schemas";
import { slideService } from "@/modules/slides/infrastructure/slides";
import { parseJsonText, presentationResponse, readFormData, requireFiles, requireText, slideErrorResponse } from "@/modules/slides/presentation/route-helpers";

export async function POST(request: Request) {
  try {
    const user = await authenticateRequest(request);
    const form = await readFormData(request);
    const metadata = creationMetadataSchema.parse({ title: requireText(form, "title"), prompt: requireText(form, "prompt"), slideCount: requireText(form, "slideCount") });
    const outline = approvedOutlineSchema(metadata.slideCount).parse(parseJsonText(requireText(form, "outline")));
    const result = await slideService.generate(user.id, { ...metadata, outline, dataFiles: requireFiles(form, "dataFiles"), templateFiles: requireFiles(form, "templateFiles") }, request.signal);
    return NextResponse.json(presentationResponse(result), { status: 201 });
  } catch (error) { return slideErrorResponse(error); }
}
