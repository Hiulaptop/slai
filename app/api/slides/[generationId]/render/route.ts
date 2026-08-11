import { NextResponse } from "next/server";

import { authenticateRequest } from "@/modules/auth/presentation/authenticate-request";
import { generationIdSchema } from "@/modules/slides/domain/slide.schemas";
import { renderStructuredRevision } from "@/modules/slides/domain/structured/render";
import { slideService } from "@/modules/slides/infrastructure/slides";
import { slideErrorResponse } from "@/modules/slides/presentation/route-helpers";

type RouteContext = { params: Promise<{ generationId: string }> };

// Renders on demand and returns the result inline (no attachment header) -
// see design.md's "Render HTML on demand from validated structured data".
// Never persists the rendered HTML.
export async function GET(request: Request, context: RouteContext) {
  try {
    const user = await authenticateRequest(request);
    const { generationId } = await context.params;
    const revision = await slideService.render(user.id, generationIdSchema.parse(generationId));
    const html = renderStructuredRevision(revision);
    return new NextResponse(html, { headers: { "content-type": "text/html; charset=utf-8" } });
  } catch (error) {
    return slideErrorResponse(error);
  }
}
