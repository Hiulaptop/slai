import { NextResponse } from "next/server";

import { authenticateRequest } from "@/modules/auth/presentation/authenticate-request";
import { authErrorResponse } from "@/modules/auth/presentation/route-helpers";

export async function GET(request: Request) {
  try {
    return NextResponse.json({ user: await authenticateRequest(request) });
  } catch (error) {
    return authErrorResponse(error);
  }
}
