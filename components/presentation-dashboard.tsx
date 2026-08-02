"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { useAuth } from "@/lib/auth/auth-context";
import type { PresentationPage, PresentationSummary } from "@/lib/types";

const dateFormatter = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

const statusLabel: Record<PresentationSummary["status"], string> = {
  PENDING: "Pending",
  PROCESSING: "Processing",
  COMPLETED: "Completed",
  FAILED: "Failed",
};

export function PresentationDashboard() {
  const { authFetch } = useAuth();
  const [items, setItems] = useState<PresentationSummary[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [pageError, setPageError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    void requestPage(authFetch).then((page) => {
      if (!active) return;
      setItems(page.items);
      setNextCursor(page.nextCursor);
    }).catch(() => {
      if (active) setError("We could not load your presentations.");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [authFetch, reloadKey]);

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    setPageError("");
    try {
      const page = await requestPage(authFetch, nextCursor);
      setItems((current) => [...current, ...page.items]);
      setNextCursor(page.nextCursor);
    } catch {
      setPageError("More presentations could not be loaded.");
    } finally {
      setLoadingMore(false);
    }
  }

  function retryInitialLoad() {
    setError("");
    setLoading(true);
    setReloadKey((key) => key + 1);
  }

  return (
    <main className="mx-auto max-w-7xl px-5 py-10 pb-28 sm:px-8 sm:py-14">
      <div className="mb-8 flex items-end justify-between gap-6">
        <div>
          <p className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-[var(--accent)]">Your workspace</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.045em] sm:text-4xl">Presentations</h1>
        </div>
        {!loading && !error && items.length > 0 ? <p className="text-sm text-[var(--muted)]">{items.length} loaded</p> : null}
      </div>

      {loading ? <DashboardSkeleton /> : null}
      {!loading && error ? (
        <section className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-8" role="alert">
          <h2 className="font-semibold">Your library is temporarily unavailable.</h2>
          <p className="mt-2 text-sm text-[var(--muted)]">{error}</p>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <Link className="ui-button ui-button-primary" href="/slides/new">Create presentation</Link>
            <button className="ui-button ui-button-secondary" type="button" onClick={retryInitialLoad}>Retry</button>
          </div>
        </section>
      ) : null}
      {!loading && !error && items.length === 0 ? <EmptyLibrary /> : null}
      {!loading && !error && items.length > 0 ? (
        <>
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="Presentation list">
            {items.map((item) => <PresentationCard key={item.id} item={item} />)}
          </section>
          <div className="mt-8 flex flex-col items-center gap-3">
            {pageError ? <p className="text-sm text-[var(--danger)]" role="status">{pageError}</p> : null}
            {nextCursor ? <button className="ui-button ui-button-secondary" type="button" onClick={loadMore} disabled={loadingMore}>{loadingMore ? "Loading..." : pageError ? "Retry load more" : "Load more"}</button> : null}
          </div>
          <Link className="ui-button ui-button-primary fixed right-5 bottom-[max(1.25rem,env(safe-area-inset-bottom))] z-10 shadow-[0_8px_30px_rgba(36,72,216,0.25)] sm:right-8" href="/slides/new">
            <span aria-hidden="true" className="mr-2 text-lg">+</span> Create
          </Link>
        </>
      ) : null}
    </main>
  );
}

async function requestPage(
  authFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
  cursor?: string,
): Promise<PresentationPage> {
  const query = new URLSearchParams({ limit: "20" });
  if (cursor) query.set("cursor", cursor);
  const response = await authFetch(`/api/slides?${query}`);
  if (!response.ok) throw new Error("List request failed");
  return response.json() as Promise<PresentationPage>;
}

function DashboardSkeleton() {
  return (
    <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="Loading presentations" aria-busy="true">
      {[0, 1, 2].map((item) => <div key={item} className="h-44 animate-pulse rounded-2xl border border-[var(--line)] bg-white/60" />)}
    </section>
  );
}

function EmptyLibrary() {
  return (
    <section className="grid min-h-[52dvh] place-items-center rounded-2xl border border-dashed border-stone-400 bg-[var(--surface)] px-6 py-16 text-center">
      <div className="max-w-sm">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-[var(--muted)]">Blank canvas</p>
        <h2 className="mt-3 text-2xl font-semibold tracking-[-0.035em]">Create your first presentation</h2>
        <p className="mt-3 text-sm leading-6 text-[var(--muted)]">Your generated slide decks will live here.</p>
        <Link className="ui-button ui-button-primary mt-7 w-full sm:w-auto" href="/slides/new">Create presentation</Link>
      </div>
    </section>
  );
}

function PresentationCard({ item }: { item: PresentationSummary }) {
  return (
    <Link className="flex min-h-44 flex-col rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[0_2px_0_rgba(23,23,19,0.035)] hover:-translate-y-0.5 hover:border-stone-400 hover:bg-white" href={`/slides/${item.id}`}>
      <div className="flex items-start justify-between gap-4">
        <h2 className="line-clamp-2 font-semibold tracking-[-0.02em]">{item.title?.trim() || "Untitled presentation"}</h2>
        <span className="shrink-0 rounded-full border border-[var(--line)] px-2 py-1 font-mono text-[10px] uppercase tracking-wide">{statusLabel[item.status]}</span>
      </div>
      <div className="mt-auto flex items-end justify-between gap-4 pt-7 text-xs text-[var(--muted)]">
        <span>Revision {item.currentRevisionNumber ?? "-"}</span>
        <time dateTime={item.updatedAt}>Updated {dateFormatter.format(new Date(item.updatedAt))}</time>
      </div>
    </Link>
  );
}
