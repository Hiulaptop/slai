"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { useAuth } from "@/lib/auth/auth-context";
import type { AuthUser } from "@/lib/types";
import { Brand } from "./brand";

export function UserNavbar({ user }: { user: AuthUser }) {
  const { logout } = useAuth();
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleLogout() {
    if (pending) return;
    setPending(true);
    try { await logout(); }
    catch { /* Local auth state is cleared in the client finally block. */ }
    finally { router.replace("/"); }
  }

  return (
    <header className="border-b border-[var(--line)] bg-[color:var(--canvas)]/95 px-4 backdrop-blur sm:px-8">
      <nav className="mx-auto grid h-16 max-w-7xl grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3" aria-label="Main navigation">
        <Brand href="/home" />
        <span className="truncate text-right text-xs text-[var(--muted)] sm:text-sm" title={user.email}>{user.email}</span>
        <button className="min-h-10 rounded-lg border border-[var(--line)] px-3 text-sm font-medium hover:bg-white" type="button" onClick={handleLogout} disabled={pending}>
          {pending ? "Leaving..." : "Logout"}
        </button>
      </nav>
    </header>
  );
}
