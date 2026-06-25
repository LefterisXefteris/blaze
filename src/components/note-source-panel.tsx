"use client";

import type { ReactNode } from "react";
import type { LinkedPriorityItem, TranscriptMessage } from "@/lib/note-source-types";
import { REASON_LABELS } from "@/lib/note-source-types";
import { NoteTranscript } from "@/components/note-transcript";
import { LiveSummaryBlock } from "@/components/live-summary-block";

type NoteSourcePanelProps = {
  sourceType: string;
  sourceRef?: string | null;
  messages?: TranscriptMessage[];
  priorityItems?: LinkedPriorityItem[];
  liveSummary?: string;
  userNotes?: string;
  scratchEditable?: boolean;
  onScratchChange?: (value: string) => void;
  onScratchSave?: () => void;
  scratchDisabled?: boolean;
  children?: ReactNode;
};

function GitHubSourceBlock({
  priorityItems,
  messages,
}: {
  priorityItems: LinkedPriorityItem[];
  messages: TranscriptMessage[];
}) {
  const primary = priorityItems[0];

  return (
    <>
      {primary && (
        <div className="notes-source-github-card">
          <div className="flex items-start justify-between gap-2 mb-2">
            <a
              href={primary.externalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium text-foreground hover:underline leading-snug"
            >
              {primary.title}
            </a>
            <span className="text-xs badge-muted px-2 py-0.5 rounded-full shrink-0">
              {REASON_LABELS[primary.reason] ?? primary.reason}
            </span>
          </div>
          <p className="text-xs text-muted mb-2">{primary.externalId}</p>
          {primary.aiSummary && (
            <p className="text-sm text-muted leading-relaxed mb-3">
              {primary.aiSummary}
            </p>
          )}
          <a
            href={primary.externalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-link hover:underline inline-block"
          >
            Open on GitHub
          </a>
        </div>
      )}

      {messages.length > 0 && (
        <div className="mt-4">
          <h4 className="notes-context-section-title mb-2">Thread</h4>
          <NoteTranscript
            messages={messages}
            emptyLabel="No comments ingested yet"
            maxHeight="320px"
          />
        </div>
      )}
    </>
  );
}

export function NoteSourcePanel({
  sourceType,
  sourceRef,
  messages = [],
  priorityItems = [],
  liveSummary,
  userNotes,
  scratchEditable = false,
  onScratchChange,
  onScratchSave,
  scratchDisabled = false,
  children,
}: NoteSourcePanelProps) {
  const panelTitle =
    sourceType === "GITHUB"
      ? "GitHub mention"
      : sourceType === "SLACK"
        ? "Slack huddle"
        : sourceType === "MEETING"
          ? "Meeting"
          : "Source";

  return (
    <div className="notes-aside-inner notes-source-panel">
      <div className="notes-context-header">
        <h2 className="text-sm font-semibold">{panelTitle}</h2>
        <p className="text-xs text-muted mt-1 leading-relaxed">
          {sourceType === "GITHUB"
            ? "The issue or PR Blaze is acting on"
            : sourceType === "SLACK" || sourceType === "MEETING"
              ? "Conversation captured from this session"
              : "Original material behind this note"}
        </p>
      </div>

      {children}

      {sourceType === "GITHUB" && (
        <section className="notes-context-section">
          <GitHubSourceBlock priorityItems={priorityItems} messages={messages} />
        </section>
      )}

      {(sourceType === "SLACK" || sourceType === "MEETING") && (
        <section className="notes-context-section">
          {sourceRef && (
            <p className="text-sm text-muted mb-3">{sourceRef}</p>
          )}
          {liveSummary && (
            <div className="mb-4">
              <h4 className="notes-context-section-title mb-2">Live notes</h4>
              <LiveSummaryBlock liveSummary={liveSummary} />
            </div>
          )}
          <h4 className="notes-context-section-title mb-2">Transcript</h4>
          <NoteTranscript
            messages={messages}
            emptyLabel={
              sourceType === "SLACK"
                ? "No transcript yet — start listening or type in Slack."
                : "No transcript yet"
            }
            maxHeight="360px"
          />
          {sourceType === "SLACK" && (
            <p className="notes-section-footnote mt-2">
              Channel messages are captured as text in real time.
            </p>
          )}
        </section>
      )}

      {sourceType === "MANUAL" && messages.length > 0 && (
        <section className="notes-context-section">
          <h4 className="notes-context-section-title mb-2">Transcript</h4>
          <NoteTranscript messages={messages} maxHeight="360px" />
        </section>
      )}

      {(scratchEditable || (userNotes && userNotes.trim())) && (
        <section className="notes-context-section">
          <div className="notes-section-heading-row">
            <h4 className="notes-context-section-title">Scratch notes</h4>
            {scratchEditable && onScratchSave && (
              <button
                type="button"
                onClick={onScratchSave}
                className="notes-section-action"
              >
                Save
              </button>
            )}
          </div>
          {scratchEditable ? (
            <textarea
              value={userNotes ?? ""}
              onChange={(e) => onScratchChange?.(e.target.value)}
              onBlur={onScratchSave}
              disabled={scratchDisabled}
              placeholder="Jot down key points..."
              className="notes-scratch-textarea"
            />
          ) : (
            <p className="text-sm leading-relaxed whitespace-pre-wrap">
              {userNotes}
            </p>
          )}
        </section>
      )}
    </div>
  );
}
