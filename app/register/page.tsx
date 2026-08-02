import { Suspense } from "react";

import { AuthForm } from "@/components/auth-form";
import { AuthShell } from "@/components/auth-shell";
import { FullPageLoader } from "@/components/ui";

export default function RegisterPage() {
  return <AuthShell><Suspense fallback={<FullPageLoader />}><AuthForm mode="register" /></Suspense></AuthShell>;
}
