import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { endSession } from "@/lib/agent/action-executor";
import { updateSessionLiveSummary } from "@/lib/agent/live-notes";
import {
  fetchChannelHistory,
  getSlackClient,
} from "@/lib/integrations/slack";

type SlackIntegrationMeta = {
  teamId?: string;
  teamName?: string;
  slackUserId?: string;
  autoHuddleCapture?: boolean;
};

export async function getSlackChannelLabel(
  userId: string,
  channelId: string
): Promise<string> {
  const client = await getSlackClient(userId);
  if (!client) return channelId;

  try {
    const info = await client.conversations.info({ channel: channelId });
    const channel = info.channel;
    if (!channel) return channelId;
    if (channel.is_im) return "DM";
    return channel.name ? `#${channel.name}` : channelId;
  } catch {
    return channelId;
  }
}

async function usersForSlackTeam(teamId: string) {
  const integrations = await db.integration.findMany({
    where: { provider: "SLACK" },
    include: { user: true },
  });

  return integrations.filter((integration) => {
    const meta = integration.metadata as SlackIntegrationMeta | null;
    return meta?.teamId === teamId;
  });
}

export async function startSlackMeetingSession(
  userId: string,
  channelId: string,
  options: {
    title?: string;
    huddle?: boolean;
    autoStarted?: boolean;
  } = {}
) {
  const existing = await db.captureSession.findFirst({
    where: {
      userId,
      status: "ACTIVE",
      sourceType: "SLACK",
      sourceRef: channelId,
    },
  });

  if (existing) return existing;

  const channelLabel = await getSlackChannelLabel(userId, channelId);
  const title =
    options.title ??
    (options.huddle
      ? `Slack huddle · ${channelLabel}`
      : `Slack meeting · ${channelLabel}`);

  const captureSession = await db.captureSession.create({
    data: {
      userId,
      title,
      sourceType: "SLACK",
      sourceRef: channelId,
      metadata: {
        huddle: options.huddle ?? false,
        autoStarted: options.autoStarted ?? false,
        channelLabel,
      } as Prisma.InputJsonValue,
    },
  });

  const history = await fetchChannelHistory(userId, channelId, 30);
  for (const msg of history) {
    await db.message.create({
      data: {
        sessionId: captureSession.id,
        externalId: msg.externalId,
        speaker: msg.speaker,
        content: msg.content,
        sentAt: msg.sentAt,
      },
    });
  }

  await updateSessionLiveSummary(captureSession.id);

  return captureSession;
}

export async function handleSlackHuddleStarted(
  teamId: string,
  channelId: string
) {
  const integrations = await usersForSlackTeam(teamId);
  const started: string[] = [];

  for (const integration of integrations) {
    const meta = integration.metadata as SlackIntegrationMeta | null;
    if (meta?.autoHuddleCapture === false) continue;

    const session = await startSlackMeetingSession(integration.userId, channelId, {
      huddle: true,
      autoStarted: true,
    });
    started.push(session.id);
  }

  return started;
}

export async function handleSlackHuddleEnded(teamId: string, channelId: string) {
  const integrations = await usersForSlackTeam(teamId);

  for (const integration of integrations) {
    const activeSessions = await db.captureSession.findMany({
      where: {
        userId: integration.userId,
        status: "ACTIVE",
        sourceType: "SLACK",
        sourceRef: channelId,
      },
    });

    for (const session of activeSessions) {
      try {
        await endSession(session.id, integration.userId);
      } catch (error) {
        console.error(`Failed to end session ${session.id}:`, error);
      }
    }
  }
}
