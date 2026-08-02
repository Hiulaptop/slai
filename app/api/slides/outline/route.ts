import { NextResponse } from "next/server";
import { authenticateRequest } from "@/modules/auth/presentation/authenticate-request";
import { slideService } from "@/modules/slides/infrastructure/slides";
import { readFormData, requireFile, slideErrorResponse } from "@/modules/slides/presentation/route-helpers";

export async function POST(request: Request) {
  try {
    await authenticateRequest(request);
    const form = await readFormData(request);
    return NextResponse.json({ outline: await slideService.suggestOutline(requireFile(form, "report"), request.signal) });
  } catch (error) { return slideErrorResponse(error); }
}
