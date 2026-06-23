import { addMinutes } from "date-fns";
import type { Prisma } from "@/generated/prisma/client";
import { IntentType } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import type { Intent } from "@/lib/types";
import { intentTypeToEnum } from "@/lib/types";
import { classifyRisk } from "@/lib/agent/risk-classifier";
import { createCalendarEvent, deleteCalendarEvent } from "@/lib/integrations/google-calendar";
import {
  addIssueLabels,
  postIssueComment,
} from "@/lib/integrations/github";
import { extractIntents } from "@/lib/agent/extractor";

export type ExecuteResult = {
  actionId: string;
  status: "auto_executed" | "pending" | "skipped";
  message: string;
};

function intentFingerprint(intent: Intent): string {
  return `${intent.type}:${intent.title.toLowerCase().trim()}`;
}

export async function processSessionIntents(sessionId: string): Promise<ExecuteResult[]> {
  const session = await db.captureSession.findUnique({
    where: { id: sessionId },
    include: {
      messages: { orderBy: { sentAt: "asc" } },
      agentActions: true,
      user: true,
    },
  });

  if (!session || session.status !== "ACTIVE") {
    return [];
  }

  const extraction = await extractIntents(
    session.messages.map((m) => ({
      id: m.id,
      speaker: m.speaker,
      content: m.content,
      sentAt: m.sentAt,
    })),
    { title: session.title }
  );

  const existingFingerprints = new Set(
    session.agentActions
      .filter((a) => a.status !== "REJECTED" && a.status !== "UNDONE")
      .map((a) => {
        const payload = a.payload as { title?: string; type?: string };
        const type = payload.type ?? a.intentType.toLowerCase();
        return `${type}:${(payload.title ?? "").toLowerCase().trim()}`;
      })
  );

  const results: ExecuteResult[] = [];

  for (const intent of extraction.intents) {
    const fp = intentFingerprint(intent);
    if (existingFingerprints.has(fp)) {
      continue;
    }
    existingFingerprints.add(fp);

    const risk = classifyRisk(intent);
    const riskLevel = risk === "low" ? "LOW" : "HIGH";

    const action = await db.agentAction.create({
      data: {
        sessionId,
        intentType: intentTypeToEnum(intent.type),
        riskLevel,
        confidence: intent.confidence,
        payload: intent as Prisma.InputJsonValue,
        sourceMessageIds: intent.sourceMessageIds,
        status: riskLevel === "HIGH" ? "PENDING" : "PENDING",
      },
    });

    if (riskLevel === "LOW") {
      const execResult = await executeAction(action.id, session.userId, session.user.undoWindowMin);
      results.push({
        actionId: action.id,
        status: execResult.success ? "auto_executed" : "pending",
        message: execResult.message,
      });
    } else {
      results.push({
        actionId: action.id,
        status: "pending",
        message: `Queued for confirmation: ${intent.title}`,
      });
    }
  }

  return results;
}

export async function executeGitHubAckComment(
  actionId: string,
  userId: string
): Promise<{ success: boolean; message: string }> {
  const action = await db.agentAction.findFirst({
    where: { id: actionId, session: { userId }, intentType: IntentType.GITHUB_ACK_COMMENT },
  });

  if (!action) {
    return { success: false, message: "Ack action not found" };
  }

  if (action.status === "AUTO_EXECUTED" || action.status === "CONFIRMED") {
    return { success: true, message: "Ack already posted" };
  }

  const payload = action.payload as Intent;
  if (!payload.repo || !payload.issueNumber || !payload.body) {
    return { success: false, message: "Missing ack comment data" };
  }

  try {
    const comment = await postIssueComment(
      userId,
      payload.repo,
      payload.issueNumber,
      payload.body
    );

    await db.agentAction.update({
      where: { id: actionId },
      data: {
        status: "AUTO_EXECUTED",
        externalId: String(comment.id),
        result: {
          type: "github_ack_comment",
          url: comment.html_url,
          status: "posted",
        },
      },
    });

    return { success: true, message: "Acknowledgment posted on GitHub" };
  } catch (error) {
    await db.agentAction.update({
      where: { id: actionId },
      data: {
        status: "FAILED",
        result: { error: String(error) },
      },
    });
    return { success: false, message: String(error) };
  }
}

export async function executeAction(
  actionId: string,
  userId: string,
  undoWindowMin = 15
): Promise<{ success: boolean; message: string }> {
  const action = await db.agentAction.findFirst({
    where: { id: actionId, session: { userId } },
    include: { session: true },
  });

  if (!action) {
    return { success: false, message: "Action not found" };
  }

  if (action.status !== "PENDING") {
    return { success: false, message: "Action already processed" };
  }

  const payload = action.payload as Intent;

  try {
    switch (action.intentType) {
      case "CALENDAR_EVENT": {
        const event = await createCalendarEvent(userId, {
          title: payload.title,
          description: payload.description,
          start: payload.start,
          end: payload.end,
          attendees: payload.attendees,
        });

        await db.agentAction.update({
          where: { id: actionId },
          data: {
            status: "AUTO_EXECUTED",
            externalId: event.id ?? undefined,
            undoExpiresAt: addMinutes(new Date(), undoWindowMin),
            result: event,
          },
        });

        return { success: true, message: `Calendar event created: ${payload.title}` };
      }

      case "TODO": {
        await db.agentAction.update({
          where: { id: actionId },
          data: {
            status: "AUTO_EXECUTED",
            undoExpiresAt: addMinutes(new Date(), undoWindowMin),
            result: {
              type: "internal_todo",
              title: payload.title,
              dueDate: payload.dueDate,
            },
          },
        });

        return { success: true, message: `Todo created: ${payload.title}` };
      }

      case "FOLLOW_UP_EMAIL":
      case "TICKET":
      case "CRM_UPDATE":
      case "GITHUB_COMMENT":
      case "GITHUB_LABEL": {
        return { success: false, message: "Requires confirmation" };
      }

      case "GITHUB_PRIORITY": {
        await db.agentAction.update({
          where: { id: actionId },
          data: { status: "AUTO_EXECUTED", result: { type: "github_priority" } },
        });
        return { success: true, message: "Added to priority list" };
      }

      case "GITHUB_ACK_COMMENT": {
        return executeGitHubAckComment(actionId, userId);
      }

      default:
        return { success: false, message: "Unknown intent type" };
    }
  } catch (error) {
    await db.agentAction.update({
      where: { id: actionId },
      data: {
        status: "FAILED",
        result: { error: String(error) },
      },
    });
    return { success: false, message: String(error) };
  }
}

export async function confirmAction(
  actionId: string,
  userId: string,
  updatedPayload?: Intent
): Promise<{ success: boolean; message: string }> {
  const action = await db.agentAction.findFirst({
    where: { id: actionId, session: { userId } },
  });

  if (!action || action.status !== "PENDING") {
    return { success: false, message: "Action not available for confirmation" };
  }

  if (updatedPayload) {
    await db.actionRevision.create({
      data: { actionId, payload: updatedPayload as Prisma.InputJsonValue },
    });
    await db.agentAction.update({
      where: { id: actionId },
      data: { payload: updatedPayload as Prisma.InputJsonValue },
    });
  }

  const payload = (updatedPayload ?? action.payload) as Intent;

  try {
    let result: Record<string, unknown> = {};

    switch (action.intentType) {
      case "FOLLOW_UP_EMAIL":
        result = {
          type: "email_draft",
          subject: payload.title,
          body: payload.description ?? payload.title,
          status: "draft_ready",
        };
        break;
      case "TICKET":
        result = {
          type: "ticket",
          title: payload.title,
          description: payload.description,
          status: "created",
        };
        break;
      case "CRM_UPDATE":
        result = {
          type: "crm_update",
          title: payload.title,
          description: payload.description,
          status: "recorded",
        };
        break;
      case "GITHUB_COMMENT": {
        if (!payload.repo || !payload.issueNumber) {
          return { success: false, message: "Missing GitHub repo/issue" };
        }
        const commentBody =
          payload.body ?? payload.description ?? payload.title;
        const comment = await postIssueComment(
          userId,
          payload.repo,
          payload.issueNumber,
          commentBody
        );
        result = {
          type: "github_comment",
          url: comment.html_url,
          status: "posted",
        };
        break;
      }
      case "GITHUB_LABEL": {
        if (!payload.repo || !payload.issueNumber || !payload.labels?.length) {
          return { success: false, message: "Missing GitHub label data" };
        }
        await addIssueLabels(
          userId,
          payload.repo,
          payload.issueNumber,
          payload.labels
        );
        result = {
          type: "github_label",
          labels: payload.labels,
          status: "applied",
        };
        break;
      }
      case "GITHUB_NEXT_STEPS": {
        const suggested = payload.suggestedAction ?? "watch";

        if (
          suggested === "follow_up_comment" &&
          payload.repo &&
          payload.issueNumber
        ) {
          const body =
            payload.draftFollowUp?.trim() ||
            payload.summary ||
            payload.title;
          const comment = await postIssueComment(
            userId,
            payload.repo,
            payload.issueNumber,
            body
          );
          result = {
            type: "github_follow_up",
            url: comment.html_url,
            status: "posted",
          };
        } else if (suggested === "mark_done") {
          await db.priorityItem.updateMany({
            where: {
              userId,
              sessionId: action.sessionId,
              status: "open",
            },
            data: { status: "done" },
          });
          result = { type: "mark_done", status: "completed" };
        } else {
          result = { type: "watch", status: "acknowledged" };
        }
        break;
      }
      default:
        return executeAction(actionId, userId, 0);
    }

    await db.agentAction.update({
      where: { id: actionId },
      data: { status: "CONFIRMED", result: result as Prisma.InputJsonValue },
    });

    return { success: true, message: `${action.intentType} confirmed` };
  } catch (error) {
    return { success: false, message: String(error) };
  }
}

export async function rejectAction(actionId: string, userId: string) {
  const action = await db.agentAction.findFirst({
    where: { id: actionId, session: { userId } },
  });

  if (!action) return { success: false, message: "Not found" };

  await db.agentAction.update({
    where: { id: actionId },
    data: { status: "REJECTED" },
  });

  return { success: true, message: "Action rejected" };
}

export async function undoAction(actionId: string, userId: string) {
  const action = await db.agentAction.findFirst({
    where: { id: actionId, session: { userId } },
  });

  if (!action) return { success: false, message: "Not found" };
  if (action.status !== "AUTO_EXECUTED" && action.status !== "CONFIRMED") {
    return { success: false, message: "Cannot undo this action" };
  }
  if (action.undoExpiresAt && action.undoExpiresAt < new Date()) {
    return { success: false, message: "Undo window expired" };
  }

  if (action.intentType === "CALENDAR_EVENT" && action.externalId) {
    await deleteCalendarEvent(userId, action.externalId);
  }

  await db.agentAction.update({
    where: { id: actionId },
    data: { status: "UNDONE" },
  });

  return { success: true, message: "Action undone" };
}

export async function endSession(sessionId: string, userId: string) {
  const session = await db.captureSession.findFirst({
    where: { id: sessionId, userId },
    include: {
      messages: { orderBy: { sentAt: "asc" } },
      agentActions: true,
    },
  });

  if (!session) throw new Error("Session not found");

  const { generateNote } = await import("@/lib/agent/extractor");

  const noteData = await generateNote(
    session.messages.map((m) => ({
      id: m.id,
      speaker: m.speaker,
      content: m.content,
      sentAt: m.sentAt,
    })),
    session.userNotes,
    session.agentActions.map((a) => ({
      type: a.intentType,
      title: (a.payload as { title?: string }).title ?? a.intentType,
      status: a.status,
    }))
  );

  await db.captureSession.update({
    where: { id: sessionId },
    data: { status: "ENDED", endedAt: new Date() },
  });

  await db.note.upsert({
    where: { sessionId },
    create: {
      sessionId,
      aiSummary: noteData.aiSummary,
      structured: noteData.structured as Prisma.InputJsonValue,
    },
    update: {
      aiSummary: noteData.aiSummary,
      structured: noteData.structured as Prisma.InputJsonValue,
    },
  });

  if (["MEETING", "SLACK", "MANUAL"].includes(session.sourceType)) {
    const { indexMeetingSession } = await import("@/lib/vector/indexer");
    void indexMeetingSession({
      userId,
      sessionId,
      title: session.title,
      aiSummary: noteData.aiSummary,
      structured: noteData.structured as {
        decisions?: string[];
        actionItems?: Array<{ text: string }>;
      },
    }).catch((error) => {
      console.error(`Meeting index on end failed for ${sessionId}:`, error);
    });
  }

  return noteData;
}
