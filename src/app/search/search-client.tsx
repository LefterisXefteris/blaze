"use client";

import { useState } from "react";
import Link from "next/link";

type SearchResults = {
  sessions: Array<{ id: string; title: string | null; startedAt: string; status: string }>;
  notes: Array<{ id: string; aiSummary: string; session: { id: string; title: string | null } }>;
  messages: Array<{
    id: string;
    content: string;
    speaker: string;
    session: { id: string; title: string | null };
  }>;
  priorityItems: Array<{
    id: string;
    title: string;
    repo: string;
    externalUrl: string;
    priority: number;
    status: string;
  }>;
  semanticHits?: Array<{
    sourceType: string;
    sourceRef: string | null;
    purpose: string | null;
    content: string;
    similarity: number;
    metadata?: { externalUrl?: string; sessionId?: string };
  }>;
};

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);

  const search = async () => {
    if (!query.trim()) return;
    setLoading(true);
    const res = await fetch(
      `/api/search?q=${encodeURIComponent(query)}&semantic=true`
    );
    if (res.ok) setResults(await res.json());
    setLoading(false);
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-semibold mb-6">Search</h1>

      <div className="flex gap-2 mb-8">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && search()}
          placeholder="Search sessions, notes, messages..."
          className="flex-1 px-4 py-2.5 text-sm border border-border rounded-lg bg-surface"
        />
        <button
          onClick={search}
          disabled={loading}
          className="px-4 py-2.5 btn-primary rounded-lg text-sm font-medium"
        >
          {loading ? "..." : "Search"}
        </button>
      </div>

      {results && (
        <div className="space-y-8">
          {results.sessions.length > 0 && (
            <section>
              <h2 className="text-sm font-medium text-muted uppercase mb-3">
                Sessions
              </h2>
              <div className="space-y-2">
                {results.sessions.map((s) => (
                  <Link
                    key={s.id}
                    href={`/sessions/${s.id}`}
                    className="block card card-hover px-4 py-3 transition-colors"
                  >
                    {s.title ?? "Untitled"} · {s.status.toLowerCase()}
                  </Link>
                ))}
              </div>
            </section>
          )}

          {results.notes.length > 0 && (
            <section>
              <h2 className="text-sm font-medium text-muted uppercase mb-3">
                Notes
              </h2>
              <div className="space-y-2">
                {results.notes.map((n) => (
                  <Link
                    key={n.id}
                    href={`/notes/${n.session.id}`}
                    className="block card card-hover px-4 py-3 transition-colors"
                  >
                    <p className="font-medium">{n.session.title ?? "Untitled"}</p>
                    <p className="text-sm text-muted mt-1 line-clamp-2">
                      {n.aiSummary}
                    </p>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {results.messages.length > 0 && (
            <section>
              <h2 className="text-sm font-medium text-muted uppercase mb-3">
                Messages
              </h2>
              <div className="space-y-2">
                {results.messages.map((m) => (
                  <Link
                    key={m.id}
                    href={`/sessions/${m.session.id}`}
                    className="block card card-hover px-4 py-3 transition-colors"
                  >
                    <p className="text-sm">
                      <span className="font-medium">{m.speaker}:</span> {m.content}
                    </p>
                    <p className="text-xs text-muted mt-1">
                      in {m.session.title ?? "Untitled"}
                    </p>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {results.priorityItems?.length > 0 && (
            <section>
              <h2 className="text-sm font-medium text-muted uppercase mb-3">
                Priority items
              </h2>
              <div className="space-y-2">
                {results.priorityItems.map((item) => (
                  <a
                    key={item.id}
                    href={item.externalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block card card-hover px-4 py-3 transition-colors"
                  >
                    <p className="font-medium">{item.title}</p>
                    <p className="text-sm text-muted mt-1">
                      {item.repo} · P{item.priority}
                    </p>
                  </a>
                ))}
              </div>
            </section>
          )}

          {results.semanticHits && results.semanticHits.length > 0 && (
            <section>
              <h2 className="text-sm font-medium text-muted uppercase mb-3">
                Semantic matches
              </h2>
              <div className="space-y-2">
                {results.semanticHits.map((hit, i) => (
                  <div key={`${hit.sourceRef ?? i}`} className="card px-4 py-3">
                    <p className="font-medium">
                      {hit.sourceRef ?? hit.sourceType}
                      <span className="text-xs text-muted ml-2">
                        {Math.round(hit.similarity * 100)}% match
                      </span>
                    </p>
                    <p className="text-sm text-muted mt-1 line-clamp-2">
                      {hit.purpose ?? hit.content}
                    </p>
                    <div className="flex gap-3 mt-2">
                      {hit.metadata?.externalUrl && (
                        <a
                          href={hit.metadata.externalUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-link hover:underline"
                        >
                          GitHub
                        </a>
                      )}
                      {hit.metadata?.sessionId && (
                        <Link
                          href={`/sessions/${hit.metadata.sessionId}`}
                          className="text-xs text-link hover:underline"
                        >
                          View session
                        </Link>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {results.sessions.length === 0 &&
            results.notes.length === 0 &&
            results.messages.length === 0 &&
            (!results.priorityItems || results.priorityItems.length === 0) &&
            (!results.semanticHits || results.semanticHits.length === 0) && (
              <p className="text-muted text-sm">No results found</p>
            )}
        </div>
      )}
    </div>
  );
}
