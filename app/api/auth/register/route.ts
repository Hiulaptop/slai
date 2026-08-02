import { authService } from "@/modules/auth/infrastructure/auth";
import { credentialsSchema } from "@/modules/auth/domain/credentials.schema";
import {
  authErrorResponse,
  authResponse,
  readJson,
  requestMetadata,
} from "@/modules/auth/presentation/route-helpers";

export async function POST(request: Request) {
  try {
    const credentials = credentialsSchema.parse(await readJson(request));
    const result = await authService.register(
      credentials,
      requestMetadata(request),
    );
    return authResponse(result, 201);
  } catch (error) {
    return authErrorResponse(error);
  }
}
