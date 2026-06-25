export type NoteSourceType = "MANUAL" | "SLACK" | "MEETING" | "GITHUB";

export type TranscriptMessage = {
  id: string;
  speaker: string;
  content: string;
  sentAt: string;
};

export type LinkedPriorityItem = {
  id: string;
  externalId: string;
  externalUrl: string;
  itemType: string;
  title: string;
  repo: string;
  reason: string;
  priority: number;
  aiSummary: string | null;
};

export type SessionAction = {
  id: string;
  intentType: string;
  riskLevel: string;
  status: string;
  payload: { title?: string; description?: string };
  undoExpiresAt?: string | null;
  createdAt: string;
};

export const REASON_LABELS: Record<string, string> = {
  assigned: "Assigned",
  mentioned: "Mentioned",
  review_requested: "Review",
  manual: "Imported",
  entity_match: "PR reference",
  semantic: "Topic match",
  explicit: "Linked",
};

export function sourceLabel(sourceType: string): string {
  switch (sourceType) {
    case "SLACK":
      return "Slack";
    case "MEETING":
      return "Meeting";
    case "GITHUB":
      return "GitHub";
    default:
      return "Notes";
  }
}
