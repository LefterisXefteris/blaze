import { z } from "zod";

export const IntentSchema = z.object({
  type: z.enum([
    "calendar_event",
    "todo",
    "follow_up_email",
    "ticket",
    "crm_update",
    "github_priority",
    "github_comment",
    "github_label",
    "github_ack_comment",
    "github_next_steps",
  ]),
  confidence: z.number().min(0).max(1),
  title: z.string(),
  description: z.string().optional(),
  start: z.string().optional(),
  end: z.string().optional(),
  dueDate: z.string().optional(),
  attendees: z.array(z.string()).optional(),
  assignee: z.string().optional(),
  sourceMessageIds: z.array(z.string()).default([]),
  risk: z.enum(["low", "high"]),
  repo: z.string().optional(),
  issueNumber: z.number().optional(),
  labels: z.array(z.string()).optional(),
  body: z.string().optional(),
  summary: z.string().optional(),
  steps: z.array(z.string()).optional(),
  suggestedAction: z
    .enum(["follow_up_comment", "mark_done", "watch"])
    .optional(),
  draftFollowUp: z.string().optional(),
});

export type Intent = z.infer<typeof IntentSchema>;

export const ExtractionResultSchema = z.object({
  intents: z.array(IntentSchema),
});

export type ExtractionResult = z.infer<typeof ExtractionResultSchema>;

export const StructuredNoteSchema = z.object({
  summary: z.string(),
  decisions: z.array(z.string()),
  actionItems: z.array(
    z.object({
      text: z.string(),
      assignee: z.string().optional(),
      dueDate: z.string().optional(),
    })
  ),
  openQuestions: z.array(z.string()),
  keyQuotes: z.array(
    z.object({
      speaker: z.string(),
      text: z.string(),
    })
  ),
});

export type StructuredNote = z.infer<typeof StructuredNoteSchema>;

export type SessionMessage = {
  id: string;
  speaker: string;
  content: string;
  sentAt: Date;
};

export const DEFAULT_RISK_BY_INTENT: Record<Intent["type"], "low" | "high"> = {
  calendar_event: "low",
  todo: "low",
  follow_up_email: "high",
  ticket: "high",
  crm_update: "high",
  github_priority: "low",
  github_comment: "high",
  github_label: "high",
  github_ack_comment: "low",
  github_next_steps: "high",
};

export function intentTypeToEnum(type: Intent["type"]) {
  const map = {
    calendar_event: "CALENDAR_EVENT",
    todo: "TODO",
    follow_up_email: "FOLLOW_UP_EMAIL",
    ticket: "TICKET",
    crm_update: "CRM_UPDATE",
    github_priority: "GITHUB_PRIORITY",
    github_comment: "GITHUB_COMMENT",
    github_label: "GITHUB_LABEL",
    github_ack_comment: "GITHUB_ACK_COMMENT",
    github_next_steps: "GITHUB_NEXT_STEPS",
  } as const;
  return map[type];
}

export function enumToIntentType(type: string): Intent["type"] | null {
  const map: Record<string, Intent["type"]> = {
    CALENDAR_EVENT: "calendar_event",
    TODO: "todo",
    FOLLOW_UP_EMAIL: "follow_up_email",
    TICKET: "ticket",
    CRM_UPDATE: "crm_update",
    GITHUB_PRIORITY: "github_priority",
    GITHUB_COMMENT: "github_comment",
    GITHUB_LABEL: "github_label",
    GITHUB_ACK_COMMENT: "github_ack_comment",
    GITHUB_NEXT_STEPS: "github_next_steps",
  };
  return map[type] ?? null;
}

export type GitHubIntegrationMetadata = {
  githubLogin?: string;
  autoAssign?: boolean;
  autoMention?: boolean;
  autoReview?: boolean;
  autoAckMention?: boolean;
};

export type GitHubIssueRef = {
  repo: string;
  number: number;
  itemType: "issue" | "pull_request";
  url: string;
  title: string;
  body?: string;
  author?: string;
  labels?: string[];
  assignees?: string[];
};

export function parseGitHubUrl(url: string): GitHubIssueRef | null {
  const match = url.match(
    /github\.com\/([^/]+\/[^/]+)\/(issues|pull)\/(\d+)/
  );
  if (!match) return null;

  const [, repo, kind, num] = match;
  return {
    repo,
    number: parseInt(num, 10),
    itemType: kind === "pull" ? "pull_request" : "issue",
    url: `https://github.com/${repo}/${kind}/${num}`,
    title: "",
  };
}
