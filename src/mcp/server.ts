#!/usr/bin/env node
import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});
const db = new PrismaClient({ adapter });

const server = new McpServer({
  name: "blaze",
  version: "1.0.0",
});

server.tool(
  "search_sessions",
  "Search capture sessions by keyword",
  {
    query: z.string().describe("Search query"),
    userId: z.string().describe("User ID to scope search"),
    limit: z.number().optional().default(10),
  },
  async ({ query, userId, limit }) => {
    const sessions = await db.captureSession.findMany({
      where: {
        userId,
        OR: [
          { title: { contains: query, mode: "insensitive" } },
          { userNotes: { contains: query, mode: "insensitive" } },
        ],
      },
      include: { note: true, _count: { select: { messages: true } } },
      take: limit,
      orderBy: { startedAt: "desc" },
    });

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(sessions, null, 2),
        },
      ],
    };
  }
);

server.tool(
  "get_session",
  "Get full session with transcript, notes, and actions",
  {
    sessionId: z.string(),
    userId: z.string(),
  },
  async ({ sessionId, userId }) => {
    const session = await db.captureSession.findFirst({
      where: { id: sessionId, userId },
      include: {
        messages: { orderBy: { sentAt: "asc" } },
        note: true,
        agentActions: true,
      },
    });

    if (!session) {
      return {
        content: [{ type: "text" as const, text: "Session not found" }],
        isError: true,
      };
    }

    return {
      content: [
        { type: "text" as const, text: JSON.stringify(session, null, 2) },
      ],
    };
  }
);

server.tool(
  "list_recent_notes",
  "List recent AI-generated notes for a user",
  {
    userId: z.string(),
    limit: z.number().optional().default(10),
  },
  async ({ userId, limit }) => {
    const notes = await db.note.findMany({
      where: { session: { userId } },
      include: {
        session: { select: { id: true, title: true, startedAt: true } },
      },
      take: limit,
      orderBy: { createdAt: "desc" },
    });

    return {
      content: [
        { type: "text" as const, text: JSON.stringify(notes, null, 2) },
      ],
    };
  }
);

server.tool(
  "list_priority_items",
  "List open priority items (GitHub inbox)",
  {
    userId: z.string(),
    status: z.string().optional().default("open"),
    limit: z.number().optional().default(20),
  },
  async ({ userId, status, limit }) => {
    const items = await db.priorityItem.findMany({
      where: { userId, status },
      orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
      take: limit,
    });

    return {
      content: [
        { type: "text" as const, text: JSON.stringify(items, null, 2) },
      ],
    };
  }
);

server.tool(
  "get_coding_handoff",
  "Get a markdown handoff bundle for a pending/confirmed GITHUB_NEXT_STEPS action — pass to your local coding agent",
  {
    actionId: z.string().describe("Agent action ID"),
    userId: z.string().describe("User ID"),
  },
  async ({ actionId, userId }) => {
    const action = await db.agentAction.findFirst({
      where: { id: actionId, session: { userId } },
      include: {
        session: {
          include: {
            messages: { orderBy: { sentAt: "asc" }, take: 20 },
          },
        },
      },
    });

    if (!action) {
      return {
        content: [{ type: "text" as const, text: "Action not found" }],
        isError: true,
      };
    }

    const payload = action.payload as Record<string, unknown>;
    const session = action.session;
    const repo = payload.repo as string | undefined;
    const issueNumber = payload.issueNumber as number | undefined;
    const externalId = repo && issueNumber ? `${repo}#${issueNumber}` : null;

    const priorityItem = externalId
      ? await db.priorityItem.findFirst({
          where: { userId, externalId },
        })
      : null;

    const notes = session.userNotes?.trim() ?? "";
    const transcript = session.messages
      .slice(-15)
      .map((m) => `${m.speaker}: ${m.content}`)
      .join("\n");

    const lines = [
      `# Coding handoff: ${externalId ?? actionId}`,
      "",
      "## Goal",
      String(payload.summary ?? `Work on ${priorityItem?.title ?? "the linked issue"}.`),
      "",
    ];

    if (externalId) {
      lines.push(
        "## GitHub issue",
        `- **Ref**: \`${externalId}\``,
        `- **Title**: ${priorityItem?.title ?? payload.title ?? ""}`,
        priorityItem?.externalUrl ? `- **URL**: ${priorityItem.externalUrl}` : "",
        priorityItem?.aiSummary ? `- **Blaze summary**: ${priorityItem.aiSummary}` : "",
        ""
      );
    }

    if (notes) lines.push("## Your notes", notes, "");
    if (transcript) lines.push("## Session transcript (recent)", transcript, "");

    lines.push(
      "## Instructions for the coding agent",
      "1. Read the issue, notes, and transcript above.",
      "2. Implement, investigate, or fix as appropriate.",
      "3. Summarize changes and whether a GitHub comment is needed.",
      "",
      `**Blaze action ID**: \`${actionId}\``,
      `**Suggested action**: \`${payload.suggestedAction ?? "handoff_coding"}\``
    );

    return {
      content: [{ type: "text" as const, text: lines.filter(Boolean).join("\n") }],
    };
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Blaze MCP server running on stdio");
}

main().catch(console.error);
