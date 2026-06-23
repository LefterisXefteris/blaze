import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import {
  externalIdForIssue,
  fetchIssueComments,
  fetchIssueOrPull,
  findUserByGitHubLogin,
  getGitHubMetadata,
  getGitHubToken,
  githubFetch,
} from "@/lib/integrations/github";
import { extractGitHubIntents, extractGitHubMentionPlan, summarizeGitHubThread } from "@/lib/agent/github-extractor";
import { executeGitHubAckComment } from "@/lib/agent/action-executor";
import { IntentType } from "@/generated/prisma/enums";
import { enqueueIntentExtraction } from "@/lib/queue";
import { indexGitHubSession } from "@/lib/vector/indexer";

type GitHubUser = { login: string };

function getRepoFullName(payload: Record<string, unknown>): string {
  const repo = payload.repository as { full_name?: string } | undefined;
  return repo?.full_name ?? "unknown/unknown";
}


async function shouldProcess(
  userId: string,
  reason: "assigned" | "mentioned" | "review_requested"
): Promise<boolean> {
  const settings = await getGitHubMetadata(userId);
  if (reason === "assigned") return settings.autoAssign !== false;
  if (reason === "mentioned") return settings.autoMention !== false;
  if (reason === "review_requested") return settings.autoReview !== false;
  return true;
}

async function processMentionActions(
  sessionId: string,
  userId: string,
  repo: string,
  number: number,
  title: string,
  messages: Array<{ id: string; speaker: string; content: string; sentAt: Date }>
) {
  const settings = await getGitHubMetadata(userId);
  const plan = await extractGitHubMentionPlan(
    repo,
    number,
    title,
    messages.map((m) => ({
      id: m.id,
      speaker: m.speaker,
      content: m.content,
      sentAt: m.sentAt,
    }))
  );

  const existingAck = await db.agentAction.findFirst({
    where: {
      sessionId,
      intentType: IntentType.GITHUB_ACK_COMMENT,
      status: { in: ["PENDING", "AUTO_EXECUTED", "CONFIRMED"] },
    },
  });

  if (!existingAck && settings.autoAckMention !== false) {
    const ackAction = await db.agentAction.create({
      data: {
        sessionId,
        intentType: IntentType.GITHUB_ACK_COMMENT,
        riskLevel: "LOW",
        confidence: 0.9,
        payload: {
          type: "github_ack_comment",
          title: `Ack on ${repo}#${number}`,
          body: plan.ackComment,
          repo,
          issueNumber: number,
          risk: "low",
          confidence: 0.9,
          sourceMessageIds: plan.nextSteps.sourceMessageIds,
        } as Prisma.InputJsonValue,
        sourceMessageIds: plan.nextSteps.sourceMessageIds,
        status: "PENDING",
      },
    });

    await executeGitHubAckComment(ackAction.id, userId);
  }

  const existingNext = await db.agentAction.findFirst({
    where: {
      sessionId,
      intentType: IntentType.GITHUB_NEXT_STEPS,
      status: { in: ["PENDING", "CONFIRMED"] },
    },
  });

  if (!existingNext) {
    await db.agentAction.create({
      data: {
        sessionId,
        intentType: IntentType.GITHUB_NEXT_STEPS,
        riskLevel: "HIGH",
        confidence: plan.nextSteps.confidence,
        payload: plan.nextSteps as Prisma.InputJsonValue,
        sourceMessageIds: plan.nextSteps.sourceMessageIds,
        status: "PENDING",
      },
    });
  }
}

async function processLegacyGitHubIntents(
  sessionId: string,
  repo: string,
  number: number,
  title: string,
  messages: Array<{ id: string; speaker: string; content: string; sentAt: Date }>
) {
  const intents = await extractGitHubIntents(
    repo,
    number,
    title,
    messages.map((m) => ({
      id: m.id,
      speaker: m.speaker,
      content: m.content,
      sentAt: m.sentAt,
    }))
  );

  for (const intent of intents.intents) {
    const intentType =
      intent.type === "github_comment"
        ? "GITHUB_COMMENT"
        : intent.type === "github_label"
          ? "GITHUB_LABEL"
          : "GITHUB_PRIORITY";

    const existing = await db.agentAction.findFirst({
      where: {
        sessionId,
        intentType,
        status: { in: ["PENDING", "AUTO_EXECUTED", "CONFIRMED"] },
      },
    });
    if (existing) continue;

    await db.agentAction.create({
      data: {
        sessionId,
        intentType,
        riskLevel: intent.risk === "low" ? "LOW" : "HIGH",
        confidence: intent.confidence,
        payload: intent as Prisma.InputJsonValue,
        sourceMessageIds: intent.sourceMessageIds,
        status: intent.risk === "high" ? "PENDING" : "AUTO_EXECUTED",
      },
    });
  }
}

export async function ingestGitHubItem(params: {
  userId: string;
  repo: string;
  number: number;
  reason: "assigned" | "mentioned" | "review_requested" | "manual";
  itemOverride?: {
    title: string;
    itemType: string;
    url: string;
    body?: string;
    author?: string;
    labels?: string[];
    assignees?: string[];
  };
}) {
  const { userId, repo, number, reason } = params;

  if (reason !== "manual" && !(await shouldProcess(userId, reason))) {
    return null;
  }

  const token = await getGitHubToken(userId);
  if (!token) throw new Error("GitHub not connected");

  const issue = params.itemOverride
    ? {
        number,
        title: params.itemOverride.title,
        body: params.itemOverride.body ?? null,
        html_url: params.itemOverride.url,
        user: params.itemOverride.author
          ? { login: params.itemOverride.author }
          : null,
        labels: (params.itemOverride.labels ?? []).map((name) => ({ name })),
        assignees: (params.itemOverride.assignees ?? []).map((login) => ({
          login,
        })),
        pull_request: params.itemOverride.itemType === "pull_request"
          ? { url: "pull" }
          : undefined,
      }
    : await fetchIssueOrPull(token, repo, number);

  const comments = params.itemOverride ? [] : await fetchIssueComments(token, repo, number);

  const itemType = issue.pull_request ? "pull_request" : "issue";
  const externalId = externalIdForIssue(repo, number);

  let session = await db.captureSession.findFirst({
    where: {
      userId,
      sourceType: "GITHUB",
      sourceRef: externalId,
      status: "ACTIVE",
    },
  });

  if (!session) {
    session = await db.captureSession.create({
      data: {
        userId,
        title: `${repo} #${number}: ${issue.title}`,
        sourceType: "GITHUB",
        sourceRef: externalId,
      },
    });

    await db.message.create({
      data: {
        sessionId: session.id,
        externalId: `issue-${number}`,
        speaker: issue.user?.login ?? "Author",
        content: issue.body ?? issue.title,
        sentAt: new Date(),
      },
    });

    for (const comment of comments) {
      await db.message.create({
        data: {
          sessionId: session.id,
          externalId: `comment-${comment.id}`,
          speaker: comment.user?.login ?? "Commenter",
          content: comment.body,
          sentAt: new Date(comment.created_at),
        },
      });
    }
  }

  const messages = await db.message.findMany({
    where: { sessionId: session.id },
    orderBy: { sentAt: "asc" },
  });

  const summary = await summarizeGitHubThread(
    issue.title,
    repo,
    reason,
    messages.map((m) => ({ speaker: m.speaker, content: m.content }))
  );

  const priorityScore =
    summary.priority ??
    (reason === "review_requested" ? 1 : reason === "assigned" ? 2 : 2);

  const priorityItem = await db.priorityItem.upsert({
    where: {
      userId_source_externalId: {
        userId,
        source: "github",
        externalId,
      },
    },
    create: {
      userId,
      source: "github",
      externalId,
      externalUrl: issue.html_url,
      itemType,
      title: issue.title,
      repo,
      reason,
      priority: priorityScore,
      aiSummary: summary.summary,
      sessionId: session.id,
      metadata: {
        labels: issue.labels.map((l) => l.name),
        assignees: issue.assignees.map((a) => a.login),
      } as Prisma.InputJsonValue,
    },
    update: {
      title: issue.title,
      reason,
      priority: priorityScore,
      aiSummary: summary.summary,
      sessionId: session.id,
      status: "open",
      metadata: {
        labels: issue.labels.map((l) => l.name),
        assignees: issue.assignees.map((a) => a.login),
      } as Prisma.InputJsonValue,
    },
  });

  if (reason === "mentioned") {
    await processMentionActions(
      session.id,
      userId,
      repo,
      number,
      issue.title,
      messages
    );
  } else {
    await processLegacyGitHubIntents(
      session.id,
      repo,
      number,
      issue.title,
      messages
    );
  }

  await enqueueIntentExtraction(session.id);

  void indexGitHubSession({
    userId,
    sessionId: session.id,
    sourceRef: externalId,
    repo,
    number,
    title: issue.title,
    itemType,
    aiSummary: summary.summary,
    body: issue.body,
    priorityItemId: priorityItem.id,
  }).catch((error) => {
    console.error(`GitHub index failed for ${externalId}:`, error);
  });

  return { session, priorityItem };
}

export async function processGitHubEvent(
  event: string,
  payload: Record<string, unknown>
) {
  const repo = getRepoFullName(payload);
  const issue = payload.issue as
    | {
        number: number;
        title: string;
        body?: string;
        html_url: string;
        user?: GitHubUser;
        pull_request?: unknown;
      }
    | undefined;
  const pullRequest = payload.pull_request as typeof issue | undefined;
  const target = issue ?? pullRequest;

  if (!target) return;

  const assignee = payload.assignee as GitHubUser | undefined;
  const comment = payload.comment as
    | { body?: string; user?: GitHubUser }
    | undefined;
  const requestedReviewer = payload.requested_reviewer as GitHubUser | undefined;

  const candidates: Array<{
    login: string;
    reason: "assigned" | "mentioned" | "review_requested";
  }> = [];

  if (event === "issues" && payload.action === "assigned" && assignee?.login) {
    candidates.push({ login: assignee.login, reason: "assigned" });
  }

  if (event === "pull_request" && payload.action === "assigned" && assignee?.login) {
    candidates.push({ login: assignee.login, reason: "assigned" });
  }

  if (event === "pull_request" && payload.action === "review_requested" && requestedReviewer?.login) {
    candidates.push({ login: requestedReviewer.login, reason: "review_requested" });
  }

  if (event === "issue_comment" && payload.action === "created" && comment?.body) {
    const mentionMatches = comment.body.match(/@([a-zA-Z0-9-]+)/g) ?? [];
    for (const m of mentionMatches) {
      candidates.push({ login: m.slice(1), reason: "mentioned" });
    }
  }

  if (
    (event === "issues" || event === "pull_request") &&
    payload.action === "opened" &&
    target.body
  ) {
    const mentionMatches = target.body.match(/@([a-zA-Z0-9-]+)/g) ?? [];
    for (const m of mentionMatches) {
      candidates.push({ login: m.slice(1), reason: "mentioned" });
    }
  }

  for (const candidate of candidates) {
    const userId = await findUserByGitHubLogin(candidate.login);
    if (!userId) continue;

    await ingestGitHubItem({
      userId,
      repo,
      number: target.number,
      reason: candidate.reason,
      itemOverride: {
        title: target.title,
        itemType: target.pull_request || event === "pull_request" ? "pull_request" : "issue",
        url: target.html_url,
        body: target.body,
        author: target.user?.login,
      },
    });
  }
}

export async function importGitHubUrl(userId: string, url: string) {
  const match = url.match(/github\.com\/([^/]+\/[^/]+)\/(issues|pull)\/(\d+)/);
  if (!match) throw new Error("Invalid GitHub issue or PR URL");

  const [, repo, , numStr] = match;
  const number = parseInt(numStr, 10);

  return ingestGitHubItem({
    userId,
    repo,
    number,
    reason: "manual",
  });
}

export async function syncGitHubMentions(userId: string) {
  const token = await getGitHubToken(userId);
  const meta = await getGitHubMetadata(userId);
  const login = meta.githubLogin;

  if (!token || !login) {
    throw new Error("GitHub not connected");
  }

  if (meta.autoMention === false) {
    return { synced: 0, skipped: true };
  }

  const since = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const q = `mentions:${login} updated:>=${since}`;

  const results = await githubFetch<{
    items: Array<{
      number: number;
      title: string;
      body: string | null;
      html_url: string;
      user: { login: string } | null;
      pull_request?: { url: string };
      repository_url: string;
    }>;
  }>(
    token,
    `/search/issues?q=${encodeURIComponent(q)}&sort=updated&order=desc&per_page=30`
  );

  let synced = 0;
  for (const item of results.items) {
    const repoMatch = item.repository_url.match(/repos\/([^/]+\/[^/]+)$/);
    const repo = repoMatch?.[1];
    if (!repo) continue;

    await ingestGitHubItem({
      userId,
      repo,
      number: item.number,
      reason: "mentioned",
      itemOverride: {
        title: item.title,
        itemType: item.pull_request ? "pull_request" : "issue",
        url: item.html_url,
        body: item.body ?? undefined,
        author: item.user?.login,
      },
    });
    synced++;
  }

  return { synced, total: results.items.length };
}
