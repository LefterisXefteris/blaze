import { format } from "date-fns";
import type { TranscriptMessage } from "@/lib/note-source-types";

export function NoteTranscript({
  messages,
  emptyLabel = "No messages yet",
  maxHeight,
}: {
  messages: TranscriptMessage[];
  emptyLabel?: string;
  maxHeight?: string;
}) {
  if (messages.length === 0) {
    return <p className="text-sm text-muted leading-relaxed">{emptyLabel}</p>;
  }

  return (
    <div
      className="notes-transcript card divide-y divide-border-subtle notes-source-panel-scroll"
      style={maxHeight ? { maxHeight } : undefined}
    >
      {messages.map((msg) => (
        <div key={msg.id} className="notes-transcript-row">
          <div className="notes-transcript-header">
            <span className="notes-transcript-speaker">{msg.speaker}</span>
            <span className="notes-transcript-time">
              {format(new Date(msg.sentAt), "HH:mm")}
            </span>
          </div>
          <p className="notes-transcript-content">{msg.content}</p>
        </div>
      ))}
    </div>
  );
}
