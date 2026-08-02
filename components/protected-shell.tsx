"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";

import { useAuth } from "@/lib/auth/auth-context";
import { FullPageLoader } from "./ui";
import { UserNavbar } from "./user-navbar";

export function ProtectedShell({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (auth.status === "anonymous") {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [auth.status, pathname, router]);

  if (auth.status !== "authenticated") return <FullPageLoader />;

  return (
    <div className="min-h-dvh">
      <UserNavbar user={auth.user} />
      {children}
    </div>
  );
}
