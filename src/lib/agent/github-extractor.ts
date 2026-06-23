import OpenAI from "openai";
import type { SessionMessage } from "@/lib/types";
import { ExtractionResultSchema } from "@/lib/types";

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

export type GitHubMentionPlan = {
  ackComment: string;
  nextSteps: {
    type: "github_next_steps";
    title: string;
    summary: string;
    steps: string[];
    suggestedAction: "follow_up_comment" | "mark_done" | "watch";
    draftFollowUp?: string;
    repo: string;
    issueNumber: number;
    risk: "high";
    confidence: number;
    sourceMessageIds: string[];
  };
};

export async function summarizeGitHubThread(
  title: string,
  repo: string,
  reason: string,
  messages: Array<{ speaker: string; content: string }>
): Promise<{ summary: string; priority: number }> {
  const transcript = messages
    .map((m) => `${m.speaker}: ${m.content}`)
    .join("\n");

  const urgentKeywords = /urgent|production|blocked|critical|asap|p0|sev-?1/i;
  const isUrgent =
    urgentKeywords.test(title) || urgentKeywords.test(transcript);

  if (!openai) {
    return {
      summary: `${reason.replace(/_/g, " ")} on ${repo}: ${title}. Review the thread and respond.`,
      priority: isUrgent ? 1 : reason === "review_requested" ? 1 : 2,
    };
  }

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            'Summarize GitHub issue/PR for triage. Return JSON: { "summary": "2-3 sentences", "priority": 1|2|3 } where 1=urgent, 2=normal, 3=low.',
        },
        {
          role: "user",
          content: `Reason: ${reason}\nRepo: ${repo}\nTitle: ${title}\n\n${transcript}`,
        },
      ],
      temperature: 0.2,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error("No summary");

    const parsed = JSON.parse(content) as { summary: string; priority: number };
    return {
      summary: parsed.summary,
      priority: parsed.priority ?? 2,
    };
  } catch {
    return {
      summary: `${reason.replace(/_/g, " ")} on ${repo}: ${title}`,
      priority: isUrgent ? 1 : 2,
    };
  }
}

function defaultMentionPlan(
  repo: string,
  issueNumber: number,
  title: string,
  messages: SessionMessage[]
): GitHubMentionPlan {
  return {
    ackComment: `Thanks for looping me in on "${title}". I'll review this thread and follow up if I have anything useful to add.`,
    nextSteps: {
      type: "github_next_steps",
      title: `Next steps for ${repo}#${issueNumber}`,
      summary: `Review "${title}" and decide whether a deeper response is needed.`,
      steps: [
        "Read the full issue/PR thread and any linked context",
        "Assess whether this needs your direct involvement",
        "Post a follow-up comment, watch, or mark done in Blaze",
      ],
      suggestedAction: "watch",
      draftFollowUp: "",
      repo,
      issueNumber,
      risk: "high",
      confidence: 0.7,
      sourceMessageIds: messages.slice(-1).map((m) => m.id),
    },
  };
}

export async function extractGitHubMentionPlan(
  repo: string,
  issueNumber: number,
  title: string,
  messages: SessionMessage[]
): Promise<GitHubMentionPlan> {
  if (!openai) {
    return defaultMentionPlan(repo, issueNumber, title, messages);
  }

  const transcript = messages
    .map((m) => `[${m.id}] ${m.speaker}: ${m.content}`)
    .join("\n");

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You triage GitHub @mentions for a busy engineer. Return JSON:
{
  "ackComment": "2-3 sentence polite ack. Thank them, say you'll review. NO technical claims or promises to fix.",
  "nextSteps": {
    "title": "short title",
    "summary": "1-2 sentence triage summary",
    "steps": ["3-4 actionable bullets for the engineer"],
    "suggestedAction": "follow_up_comment" | "mark_done" | "watch",
    "draftFollowUp": "optional longer comment if follow_up_comment, else empty string"
  }
}
For large OSS repos the engineer may not be a contributor — default to watch/triage, not jumping in to fix.`,
        },
        {
          role: "user",
          content: `Repo: ${repo}\nIssue: #${issueNumber}\nTitle: ${title}\n\n${transcript}`,
        },
      ],
      temperature: 0.3,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error("No extraction");

    const parsed = JSON.parse(content) as {
      ackComment: string;
      nextSteps: {
        title: string;
        summary: string;
        steps: string[];
        suggestedAction: "follow_up_comment" | "mark_done" | "watch";
        draftFollowUp?: string;
      };
    };

    return {
      ackComment: parsed.ackComment.trim(),
      nextSteps: {
        type: "github_next_steps",
        title: parsed.nextSteps.title,
        summary: parsed.nextSteps.summary,
        steps: parsed.nextSteps.steps,
        suggestedAction: parsed.nextSteps.suggestedAction ?? "watch",
        draftFollowUp: parsed.nextSteps.draftFollowUp ?? "",
        repo,
        issueNumber,
        risk: "high",
        confidence: 0.85,
        sourceMessageIds: messages.slice(-1).map((m) => m.id),
      },
    };
  } catch {
    return defaultMentionPlan(repo, issueNumber, title, messages);
  }
}

export async function extractGitHubIntents(
  repo: string,
  issueNumber: number,
  title: string,
  messages: SessionMessage[]
) {
  if (!openai) {
    return {
      intents: [
        {
          type: "github_comment" as const,
          confidence: 0.7,
          title: `Draft response on ${repo}#${issueNumber}`,
          description: `Thanks for the update on "${title}". I'll take a look and follow up shortly.`,
          body: `Thanks for the update on "${title}". I'll take a look and follow up shortly.`,
          repo,
          issueNumber,
          sourceMessageIds: messages.slice(-1).map((m) => m.id),
          risk: "high" as const,
        },
      ],
    };
  }

  const transcript = messages
    .map((m) => `[${m.id}] ${m.speaker}: ${m.content}`)
    .join("\n");

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `Extract GitHub actions from issue thread. Return JSON { "intents": [...] }
Types: github_comment (high, include body draft), github_label (high, include labels array).
Each intent needs: type, confidence, title, description, repo "${repo}", issueNumber ${issueNumber}, body or labels, sourceMessageIds, risk.`,
        },
        { role: "user", content: `Title: ${title}\n\n${transcript}` },
      ],
      temperature: 0.3,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error("No extraction");

    const parsed = ExtractionResultSchema.safeParse(JSON.parse(content));
    if (parsed.success) return parsed.data;
  } catch {
    // fall through
  }

  return {
    intents: [
      {
        type: "github_comment" as const,
        confidence: 0.7,
        title: `Draft response on ${repo}#${issueNumber}`,
        body: `Acknowledged — reviewing "${title}" now.`,
        repo,
        issueNumber,
        sourceMessageIds: [],
        risk: "high" as const,
      },
    ],
  };
}
