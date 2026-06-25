"use client";

import Link from "next/link";
import type { RelatedContext } from "@/lib/session-stream-types";

export function RelatedContextCompact({
  relatedContext,
}: {
  relatedContext: RelatedContext | null;
}) {
  const hits = relatedContext?.hits?.slice(0, 3) ?? [];
  if (hits.length === 0) {
    return (
      <p className="text-xs text-muted leading-relaxed py-1">
        Related PRs and past meetings appear here as Blaze analyzes your note.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {hits.map((hit, i) => {
        const url = hit.metadata?.externalUrl;
        const sessionId = hit.metadata?.sessionId;
        const reasonLabel =
          hit.linkReason === "entity_match"
            ? "PR reference"
            : hit.linkReason === "explicit"
              ? "Linked"
              : `${Math.round(hit.similarity * 100)}% match`;

        return (
          <div
            key={`${hit.sourceRef ?? hit.content}-${i}`}
            className="rounded-lg border border-border-subtle px-3 py-2"
          >
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="text-xs font-medium text-muted truncate">
                {hit.sourceType === "PRIORITY" || hit.sourceType === "GITHUB"
                  ? "GitHub"
                  : hit.sourceType.toLowerCase()}
                {hit.sourceRef ? ` · ${hit.sourceRef}` : ""}
              </span>
              <span className="text-xs badge-muted px-2 py-0.5 rounded-full shrink-0">
                {reasonLabel}
              </span>
            </div>
            <p className="text-xs leading-relaxed line-clamp-2">
              {hit.purpose ?? hit.content.slice(0, 160)}
            </p>
            <div className="flex gap-3 mt-1.5">
              {url && (
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-link hover:underline"
                >
                  Open
                </a>
              )}
              {sessionId && (
                <Link
                  href={`/sessions/${sessionId}`}
                  className="text-xs text-link hover:underline"
                >
                  View thread
                </Link>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
