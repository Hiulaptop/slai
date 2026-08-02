import { NextResponse } from "next/server";
import { authenticateRequest } from "@/modules/auth/presentation/authenticate-request";
import { slideService } from "@/modules/slides/infrastructure/slides";
import { creationMetadataSchema } from "@/modules/slides/domain/slide.schemas";
import { readFormData, requireFiles, requireText, slideErrorResponse } from "@/modules/slides/presentation/route-helpers";

export async function POST(request: Request) {
  try {
    await authenticateRequest(request);
    const form = await readFormData(request);
    const metadata = creationMetadataSchema.parse({ title: requireText(form, "title"), prompt: requireText(form, "prompt"), slideCount: requireText(form, "slideCount") });
    return NextResponse.json({ outline: await slideService.suggestOutline({ ...metadata, dataFiles: requireFiles(form, "dataFiles") }, request.signal) });
  } catch (error) { return slideErrorResponse(error); }
}
