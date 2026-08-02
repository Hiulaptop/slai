import { NextResponse } from "next/server";

import { authenticateRequest } from "@/modules/auth/presentation/authenticate-request";
import { presentationListQuerySchema } from "@/modules/slides/domain/slide.schemas";
import { slideService } from "@/modules/slides/infrastructure/slides";
import {
  presentationListResponse,
  slideErrorResponse,
} from "@/modules/slides/presentation/route-helpers";

export async function GET(request: Request) {
  try {
    const user = await authenticateRequest(request);
    const url = new URL(request.url);
    const query = presentationListQuerySchema.parse({
      ...(url.searchParams.has("limit")
        ? { limit: url.searchParams.get("limit") }
        : {}),
      ...(url.searchParams.has("cursor")
        ? { cursor: url.searchParams.get("cursor") }
        : {}),
    });
    return NextResponse.json(
      presentationListResponse(await slideService.list(user.id, query)),
    );
  } catch (error) {
    return slideErrorResponse(error);
  }
}
