import { NextResponse } from "next/server";

import { authenticateRequest } from "@/modules/auth/presentation/authenticate-request";
import { generationIdSchema } from "@/modules/slides/domain/slide.schemas";
import { renderStandaloneHtml } from "@/modules/slides/infrastructure/structured/render-standalone-html";
import { slideService } from "@/modules/slides/infrastructure/slides";
import { slideErrorResponse } from "@/modules/slides/presentation/route-helpers";

type RouteContext = { params: Promise<{ generationId: string }> };

// Same render as ../render, but with a stable attachment filename/content
// type so browsers save it as a standalone, dependency-free .html file - see
// design.md's "Download returns text/html with Content-Disposition:
// attachment". Uses the Tailwind-class render/compile pipeline
// (add-tailwind-text-styling) with a graceful fallback to plain inline
// styles if the compile step is unavailable.
export async function GET(request: Request, context: RouteContext) {
  try {
    const user = await authenticateRequest(request);
    const { generationId } = await context.params;
    const id = generationIdSchema.parse(generationId);
    const revision = await slideService.render(user.id, id);
    const html = await renderStandaloneHtml(revision);
    return new NextResponse(html, {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "content-disposition": `attachment; filename="presentation-${id}.html"`,
      },
    });
  } catch (error) {
    return slideErrorResponse(error);
  }
}
