import { sourceLabel } from "@/lib/note-source-types";

function SlackIcon({ className = "w-3.5 h-3.5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M5.042 15.165a2.528 2.528 0 01-2.52 2.523A2.528 2.528 0 010 15.165a2.527 2.527 0 012.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 012.521-2.52 2.527 2.527 0 012.521 2.52v6.313A2.528 2.528 0 018.34 24a2.528 2.528 0 01-2.52-2.522v-6.313zM8.34 5.042a2.528 2.528 0 01-2.52-2.52A2.528 2.528 0 018.34 0a2.528 2.528 0 012.521 2.522v2.52H8.34zm0 1.271a2.528 2.528 0 012.521 2.521 2.528 2.528 0 01-2.521 2.521H2.522A2.528 2.528 0 010 8.34a2.528 2.528 0 012.522-2.521H8.34zm6.313 2.521a2.528 2.528 0 012.521-2.521A2.528 2.528 0 0124 8.34a2.528 2.528 0 01-2.522 2.521h-2.522V8.34zm-1.271 0a2.528 2.528 0 01-2.521 2.522 2.528 2.528 0 01-2.521-2.522V2.522A2.528 2.528 0 0113.66 0a2.528 2.528 0 012.521 2.522v6.313zm2.521 8.34a2.528 2.528 0 012.521 2.522 2.528 2.528 0 01-2.521 2.522 2.527 2.527 0 01-2.521-2.522v-2.522h2.521zm0-1.271a2.527 2.527 0 01-2.521-2.52 2.527 2.527 0 012.521-2.521h6.313A2.528 2.528 0 0124 13.66a2.528 2.528 0 01-2.522 2.521h-6.313z" />
    </svg>
  );
}

function GitHubIcon({ className = "w-3.5 h-3.5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M12 2C6.477 2 2 6.586 2 12.253c0 4.525 2.865 8.37 6.839 9.727.5.094.683-.22.683-.488 0-.241-.009-.878-.014-1.723-2.782.622-3.369-1.366-3.369-1.366-.454-1.174-1.11-1.487-1.11-1.487-.908-.636.069-.624.069-.624 1.004.073 1.532 1.058 1.532 1.058.892 1.561 2.341 1.11 2.91.849.091-.666.349-1.11.635-1.365-2.221-.258-4.555-1.136-4.555-5.07 0-1.12.39-2.036 1.03-2.754-.104-.258-.447-1.295.098-2.698 0 0 .84-.272 2.75 1.052A9.32 9.32 0 0112 6.86c.85.004 1.705.116 2.504.34 1.909-1.324 2.748-1.052 2.748-1.052.546 1.403.203 2.44.1 2.698.64.718 1.028 1.634 1.028 2.754 0 3.944-2.337 4.81-4.566 5.062.359.317.678.94.678 1.895 0 1.368-.012 2.47-.012 2.806 0 .27.18.586.688.486C19.138 20.618 22 16.776 22 12.253 22 6.586 17.523 2 12 2z" />
    </svg>
  );
}

function NoteIcon({ className = "w-3.5 h-3.5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className={className} aria-hidden>
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function MeetingIcon({ className = "w-3.5 h-3.5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className={className} aria-hidden>
      <path d="M4 8.5V18a1 1 0 001 1h14a1 1 0 001-1V8.5M8 5h8l1 3H7l1-3z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 12h6M9 15h4" strokeLinecap="round" />
    </svg>
  );
}

export function NoteSourceIcon({
  sourceType,
  className,
}: {
  sourceType: string;
  className?: string;
}) {
  const cls = className ?? "w-3.5 h-3.5";
  switch (sourceType) {
    case "SLACK":
      return <SlackIcon className={`${cls} notes-sidebar-source-slack`} />;
    case "MEETING":
      return <MeetingIcon className={`${cls} notes-sidebar-source-meeting`} />;
    case "GITHUB":
      return <GitHubIcon className={`${cls} notes-sidebar-source-github`} />;
    default:
      return <NoteIcon className={`${cls} notes-sidebar-source-manual`} />;
  }
}

export function NoteSourceBadge({
  sourceType,
  sourceRef,
  date,
}: {
  sourceType: string;
  sourceRef?: string | null;
  date?: string;
}) {
  const label = sourceLabel(sourceType);
  const refText =
    sourceRef && sourceType !== "MANUAL" ? sourceRef : null;

  return (
    <div className="notes-source-badge">
      <span className="notes-source-badge-pill">
        <NoteSourceIcon sourceType={sourceType} />
        <span>{label}</span>
        {refText && (
          <>
            <span className="notes-source-badge-sep" aria-hidden>
              ·
            </span>
            <span className="notes-source-badge-ref">{refText}</span>
          </>
        )}
      </span>
      {date && <span className="notes-date">{date}</span>}
    </div>
  );
}
