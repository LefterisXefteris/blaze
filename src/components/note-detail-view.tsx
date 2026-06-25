"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { NotesShell } from "@/components/notes-shell";
import { NoteSourceBadge } from "@/components/note-source-badge";
import { NoteSourcePanel } from "@/components/note-source-panel";
import { NoteAgentPanel } from "@/components/note-agent-panel";
import { NoteDeleteButton } from "@/components/note-delete-button";
import type { LinkedPriorityItem, TranscriptMessage } from "@/lib/note-source-types";

type StructuredNote = {
  decisions?: string[];
  actionItems?: Array<{ text: string; assignee?: string }>;
  openQuestions?: string[];
  keyQuotes?: Array<{ speaker: string; text: string }>;
};

type NoteDetailViewProps = {
  sessionId: string;
  title: string;
  endedAt: string;
  sourceType: string;
  sourceRef?: string | null;
  userNotes?: string;
  summary: string;
  structured: StructuredNote;
  messages: TranscriptMessage[];
  priorityItems?: LinkedPriorityItem[];
};

export function NoteDetailView({
  sessionId,
  title,
  endedAt,
  sourceType,
  sourceRef,
  userNotes,
  summary,
  structured,
  messages,
  priorityItems = [],
}: NoteDetailViewProps) {
  const router = useRouter();
  const [sidebarRefreshKey, setSidebarRefreshKey] = useState(0);
  const displayTitle = title?.trim() || "Untitled";
  const showTranscriptInMain =
    sourceType === "MANUAL" && messages.length > 0;

  const aside = (
    <NoteSourcePanel
      sourceType={sourceType}
      sourceRef={sourceRef}
      messages={messages}
      priorityItems={priorityItems}
      userNotes={userNotes}
    />
  );

  return (
    <NotesShell
      activeSessionId={sessionId}
      aside={aside}
      defaultContextOpen={sourceType !== "MANUAL" || messages.length > 0}
      sidebarRefreshKey={sidebarRefreshKey}
      toolbarActions={
        <NoteDeleteButton
          sessionId={sessionId}
          title={displayTitle}
          onDeleted={() => {
            setSidebarRefreshKey((key) => key + 1);
            router.refresh();
          }}
        />
      }
    >
      <main className="notes-document">
        <h1 className="notes-title-display">{displayTitle}</h1>
        <NoteSourceBadge
          sourceType={sourceType}
          sourceRef={sourceRef}
          date={format(new Date(endedAt), "PPP")}
        />

        <article className="notes-article">
          <NoteAgentPanel sessionId={sessionId} variant="hero" />

          {summary && (
            <section className="notes-section">
              <h2 className="notes-section-title">Summary</h2>
              <p className="notes-section-body prose-muted">{summary}</p>
            </section>
          )}

          {structured.decisions && structured.decisions.length > 0 && (
            <section className="notes-section">
              <h2 className="notes-section-title">Decisions</h2>
              <ul className="notes-section-list">
                {structured.decisions.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            </section>
          )}

          {structured.actionItems && structured.actionItems.length > 0 && (
            <section className="notes-section">
              <h2 className="notes-section-title">Action items</h2>
              <ul className="notes-section-list">
                {structured.actionItems.map((item, i) => (
                  <li key={i}>
                    {item.text}
                    {item.assignee && (
                      <span className="text-muted"> — {item.assignee}</span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {structured.openQuestions && structured.openQuestions.length > 0 && (
            <section className="notes-section">
              <h2 className="notes-section-title">Open questions</h2>
              <ul className="notes-section-list">
                {structured.openQuestions.map((q, i) => (
                  <li key={i}>{q}</li>
                ))}
              </ul>
            </section>
          )}

          {showTranscriptInMain && (
            <section className="notes-section">
              <h2 className="notes-section-title">Transcript</h2>
              <p className="notes-section-body text-muted text-sm">
                See full transcript in the source panel →
              </p>
            </section>
          )}

          {structured.keyQuotes && structured.keyQuotes.length > 0 && (
            <section className="notes-section">
              <h2 className="notes-section-title">Key quotes</h2>
              <div className="notes-quotes">
                {structured.keyQuotes.map((q, i) => (
                  <blockquote key={i} className="notes-quote">
                    &ldquo;{q.text}&rdquo;
                    <footer className="notes-quote-attribution">— {q.speaker}</footer>
                  </blockquote>
                ))}
              </div>
            </section>
          )}
        </article>
      </main>
    </NotesShell>
  );
}
