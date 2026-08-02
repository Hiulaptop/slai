import type { AuthUser } from "../domain/auth.types";
import { authService } from "../infrastructure/auth";

export function authenticateRequest(request: Request): Promise<AuthUser> {
  return authService.authenticate(request.headers.get("authorization"));
}
