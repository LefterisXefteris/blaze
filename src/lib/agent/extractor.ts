import { addDays, addHours, nextDay, setHours, setMinutes } from "date-fns";
import type { SessionMessage, Intent, ExtractionResult } from "@/lib/types";
import { ExtractionResultSchema } from "@/lib/types";
import OpenAI from "openai";

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

function parseRelativeDate(text: string, reference: Date): string | undefined {
  const lower = text.toLowerCase();
  const dayNames = [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
  ];

  let target = new Date(reference);

  for (let i = 0; i < dayNames.length; i++) {
    if (lower.includes(dayNames[i])) {
      target = nextDay(reference, i as 0 | 1 | 2 | 3 | 4 | 5 | 6);
      break;
    }
  }

  if (lower.includes("tomorrow")) {
    target = addDays(reference, 1);
  }

  const timeMatch = lower.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
  if (timeMatch) {
    let hours = parseInt(timeMatch[1], 10);
    const minutes = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
    const meridiem = timeMatch[3];

    if (meridiem === "pm" && hours < 12) hours += 12;
    if (meridiem === "am" && hours === 12) hours = 0;
    if (!meridiem && hours <= 7) hours += 12;

    target = setMinutes(setHours(target, hours), minutes);
  } else {
    target = setMinutes(setHours(target, 15), 0);
  }

  return target.toISOString();
}

function ruleBasedExtract(
  messages: SessionMessage[],
  reference: Date
): ExtractionResult {
  const intents: Intent[] = [];
  const seen = new Set<string>();

  for (const msg of messages) {
    const text = msg.content;
    const lower = text.toLowerCase();

    const calendarPatterns = [
      /(?:let'?s|can we|schedule|meet|sync|call|chat)\s+(?:on\s+)?(.{0,80})/i,
      /(?:tuesday|wednesday|thursday|friday|monday|tomorrow).{0,40}(?:\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i,
    ];

    if (
      calendarPatterns.some((p) => p.test(text)) &&
      (lower.includes("meet") ||
        lower.includes("sync") ||
        lower.includes("call") ||
        lower.includes("schedule") ||
        lower.includes("calendar"))
    ) {
      const key = `cal:${text.slice(0, 40)}`;
      if (!seen.has(key)) {
        seen.add(key);
        const start = parseRelativeDate(text, reference);
        intents.push({
          type: "calendar_event",
          confidence: 0.75,
          title: text.includes("sync") ? "Sync meeting" : "Meeting",
          description: text,
          start,
          end: start ? addHours(new Date(start), 1).toISOString() : undefined,
          attendees: [],
          sourceMessageIds: [msg.id],
          risk: "low",
        });
      }
    }

    const todoPatterns = [
      /i(?:'ll|\s+will)\s+(.{5,120})/i,
      /(?:action item|todo|task):\s*(.{3,120})/i,
      /(?:send|share|prepare|finish|complete)\s+(?:the\s+)?(.{5,80})/i,
    ];

    for (const pattern of todoPatterns) {
      const match = text.match(pattern);
      if (match) {
        const title = match[1].trim().replace(/[.!?]$/, "");
        const key = `todo:${title.slice(0, 40)}`;
        if (!seen.has(key) && title.length > 4) {
          seen.add(key);
          intents.push({
            type: "todo",
            confidence: 0.7,
            title: title.charAt(0).toUpperCase() + title.slice(1),
            sourceMessageIds: [msg.id],
            risk: "low",
          });
        }
      }
    }

    if (
      (lower.includes("draft") || lower.includes("send")) &&
      (lower.includes("email") || lower.includes("recap") || lower.includes("follow"))
    ) {
      const key = `email:${text.slice(0, 40)}`;
      if (!seen.has(key)) {
        seen.add(key);
        intents.push({
          type: "follow_up_email",
          confidence: 0.8,
          title: "Follow-up email",
          description: text,
          sourceMessageIds: [msg.id],
          risk: "high",
        });
      }
    }

    if (
      lower.includes("bug") ||
      lower.includes("ticket") ||
      lower.includes("file an issue") ||
      lower.includes("linear") ||
      lower.includes("jira")
    ) {
      const key = `ticket:${text.slice(0, 40)}`;
      if (!seen.has(key)) {
        seen.add(key);
        intents.push({
          type: "ticket",
          confidence: 0.75,
          title: "Issue from conversation",
          description: text,
          sourceMessageIds: [msg.id],
          risk: "high",
        });
      }
    }
  }

  return { intents };
}

function ruleBasedLiveSummary(
  messages: SessionMessage[],
  userNotes: string,
  title?: string | null
): string {
  if (messages.length === 0) {
    return userNotes.trim() || "Waiting for conversation to start…";
  }

  const recent = messages.slice(-8);
  const speakers = [...new Set(recent.map((m) => m.speaker))];
  const lines = [
    title ? `**${title}**` : "**Meeting in progress**",
    "",
    `Participants: ${speakers.join(", ")}`,
    "",
    "**Recent discussion**",
    ...recent.map((m) => `• ${m.speaker}: ${m.content.slice(0, 120)}${m.content.length > 120 ? "…" : ""}`),
  ];

  if (userNotes.trim()) {
    lines.push("", "**Your notes**", userNotes.trim());
  }

  return lines.join("\n");
}

export async function generateLiveSummary(
  messages: SessionMessage[],
  userNotes: string,
  sessionMeta: { title?: string | null; sourceType?: string },
  relatedContext?: string
): Promise<string> {
  if (messages.length === 0) {
    return userNotes.trim() || "Waiting for conversation to start…";
  }

  const window = messages.slice(-30);
  const sourceLabel =
    sessionMeta.sourceType === "SLACK" ? "Slack meeting/huddle" : "Meeting";

  if (!openai) {
    return ruleBasedLiveSummary(window, userNotes, sessionMeta.title);
  }

  const transcript = window
    .map((m) => `${m.speaker}: ${m.content}`)
    .join("\n");

  const contextBlock = relatedContext?.trim()
    ? `\n\nRelated workspace context (use only if relevant to the discussion — do not invent details):\n${relatedContext.trim()}`
    : "";

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You write live meeting notes like Granola — concise, scannable markdown.
Format:
- One-line meeting context
- **Key points** (3-6 bullets, only what's substantively discussed)
- **Decisions** (if any, else omit section)
- **Action items** (if any, with owner when clear)
- **Open questions** (if any)
${relatedContext?.trim() ? "- **Related PR/issue context** (brief, if workspace context is relevant to this meeting)" : ""}

Keep it short. Update-style notes for someone glancing during a live ${sourceLabel}.
Do not invent facts. Use only the transcript and provided workspace context.`,
        },
        {
          role: "user",
          content: `Meeting: ${sessionMeta.title ?? "Untitled"}\nUser scratch notes:\n${userNotes || "(none)"}\n\nTranscript:\n${transcript}${contextBlock}`,
        },
      ],
      temperature: 0.3,
    });

    return (
      response.choices[0]?.message?.content?.trim() ??
      ruleBasedLiveSummary(window, userNotes, sessionMeta.title)
    );
  } catch {
    return ruleBasedLiveSummary(window, userNotes, sessionMeta.title);
  }
}

export async function extractIntents(
  messages: SessionMessage[],
  sessionMeta: { title?: string | null; participants?: string[] }
): Promise<ExtractionResult> {
  if (messages.length === 0) {
    return { intents: [] };
  }

  const reference = new Date();
  const window = messages.slice(-20);

  if (!openai) {
    return ruleBasedExtract(window, reference);
  }

  const transcript = window
    .map((m) => `[${m.id}] ${m.speaker}: ${m.content}`)
    .join("\n");

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You extract actionable intents from conversation transcripts.
Return JSON: { "intents": [...] }
Each intent: type (calendar_event|todo|follow_up_email|ticket|crm_update), confidence (0-1), title, optional description/start/end/dueDate/attendees/assignee, sourceMessageIds (array of message ids from transcript), risk (low for calendar_event and todo, high for others).
Session: ${sessionMeta.title ?? "Untitled"}. Today: ${reference.toISOString()}.
Only extract clear, actionable intents. Never auto high-risk without explicit request.`,
        },
        { role: "user", content: transcript },
      ],
      temperature: 0.2,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return ruleBasedExtract(window, reference);

    const parsed = ExtractionResultSchema.safeParse(JSON.parse(content));
    return parsed.success ? parsed.data : ruleBasedExtract(window, reference);
  } catch {
    return ruleBasedExtract(window, reference);
  }
}

export async function generateNote(
  messages: SessionMessage[],
  userNotes: string,
  actions: Array<{ type: string; title: string; status: string }>
) {
  if (!openai) {
    const speakers = [...new Set(messages.map((m) => m.speaker))];
    return {
      aiSummary: `Conversation with ${speakers.join(", ")} covering ${messages.length} messages.${userNotes ? ` User notes: ${userNotes}` : ""}`,
      structured: {
        summary: `Discussion captured from ${messages.length} messages.`,
        decisions: [],
        actionItems: actions
          .filter((a) => a.status !== "REJECTED" && a.status !== "UNDONE")
          .map((a) => ({ text: a.title })),
        openQuestions: [],
        keyQuotes: messages.slice(-3).map((m) => ({
          speaker: m.speaker,
          text: m.content,
        })),
      },
    };
  }

  const transcript = messages
    .map((m) => `${m.speaker}: ${m.content}`)
    .join("\n");

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `Generate meeting/conversation notes as JSON with: summary, decisions (array), actionItems (array of {text, assignee?, dueDate?}), openQuestions (array), keyQuotes (array of {speaker, text}).
Include agent actions taken: ${JSON.stringify(actions)}`,
      },
      {
        role: "user",
        content: `User scratch notes:\n${userNotes || "(none)"}\n\nTranscript:\n${transcript}`,
      },
    ],
    temperature: 0.3,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    const speakers = [...new Set(messages.map((m) => m.speaker))];
    return {
      aiSummary: `Conversation with ${speakers.join(", ")} covering ${messages.length} messages.`,
      structured: {
        summary: `Discussion captured from ${messages.length} messages.`,
        decisions: [],
        actionItems: actions
          .filter((a) => a.status !== "REJECTED" && a.status !== "UNDONE")
          .map((a) => ({ text: a.title })),
        openQuestions: [],
        keyQuotes: messages.slice(-3).map((m) => ({
          speaker: m.speaker,
          text: m.content,
        })),
      },
    };
  }

  const parsed = JSON.parse(content);
  return {
    aiSummary: parsed.summary ?? "Session summary",
    structured: parsed,
  };
}

export async function runRecipe(
  prompt: string,
  messages: SessionMessage[],
  userNotes: string
): Promise<string> {
  const transcript = messages
    .map((m) => `${m.speaker}: ${m.content}`)
    .join("\n");

  if (!openai) {
    return `[Recipe output — set OPENAI_API_KEY for AI generation]\n\nPrompt: ${prompt}\n\nContext: ${transcript.slice(0, 500)}...`;
  }

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: prompt },
      {
        role: "user",
        content: `User notes:\n${userNotes}\n\nTranscript:\n${transcript}`,
      },
    ],
    temperature: 0.5,
  });

  return response.choices[0]?.message?.content ?? "No output generated.";
}
