import { credentialsSchema } from "@/modules/auth/domain/credentials.schema";
import { authService } from "@/modules/auth/infrastructure/auth";
import {
  authErrorResponse,
  authResponse,
  readJson,
  requestMetadata,
} from "@/modules/auth/presentation/route-helpers";

export async function POST(request: Request) {
  try {
    const credentials = credentialsSchema.parse(await readJson(request));
    const result = await authService.login(credentials, requestMetadata(request));
    return authResponse(result, 200);
  } catch (error) {
    return authErrorResponse(error);
  }
}
