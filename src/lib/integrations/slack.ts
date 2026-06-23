import { WebClient } from "@slack/web-api";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import {
  enqueueIntentExtraction,
  scheduleLiveNotesUpdate,
} from "@/lib/queue";

export async function getSlackClient(userId: string): Promise<WebClient | null> {
  const integration = await db.integration.findUnique({
    where: { userId_provider: { userId, provider: "SLACK" } },
  });

  if (!integration) return null;
  return new WebClient(integration.accessToken);
}

export async function isSlackConnected(userId: string) {
  const integration = await db.integration.findUnique({
    where: { userId_provider: { userId, provider: "SLACK" } },
  });
  return !!integration;
}

export async function getSlackMetadata(userId: string) {
  const integration = await db.integration.findUnique({
    where: { userId_provider: { userId, provider: "SLACK" } },
  });
  if (!integration) return null;
  return integration.metadata as {
    teamId?: string;
    teamName?: string;
    slackUserId?: string;
    autoHuddleCapture?: boolean;
  } | null;
}

export async function updateSlackSettings(
  userId: string,
  settings: { autoHuddleCapture?: boolean }
) {
  const integration = await db.integration.findUnique({
    where: { userId_provider: { userId, provider: "SLACK" } },
  });
  if (!integration) throw new Error("Slack not connected");

  const metadata = (integration.metadata as Record<string, unknown>) ?? {};
  await db.integration.update({
    where: { id: integration.id },
    data: {
      metadata: { ...metadata, ...settings } as Prisma.InputJsonValue,
    },
  });
}

export async function saveSlackIntegration(
  userId: string,
  accessToken: string,
  metadata?: Record<string, unknown>
) {
  await db.integration.upsert({
    where: { userId_provider: { userId, provider: "SLACK" } },
    create: {
      userId,
      provider: "SLACK",
      accessToken,
      metadata: (metadata ?? {}) as Prisma.InputJsonValue,
    },
    update: {
      accessToken,
      metadata: (metadata ?? {}) as Prisma.InputJsonValue,
    },
  });
}

export async function listSlackChannels(userId: string) {
  const client = await getSlackClient(userId);
  if (!client) return [];

  const [channels, ims] = await Promise.all([
    client.conversations.list({ types: "public_channel,private_channel", limit: 50 }),
    client.conversations.list({ types: "im", limit: 50 }),
  ]);

  const items = [
    ...(channels.channels ?? []).map((c) => ({
      id: c.id!,
      name: c.name ?? c.id!,
      type: "channel" as const,
    })),
    ...(ims.channels ?? []).map((c) => ({
      id: c.id!,
      name: c.user ? `DM:${c.user}` : c.id!,
      type: "im" as const,
    })),
  ];

  return items;
}

export async function fetchChannelHistory(
  userId: string,
  channelId: string,
  limit = 50
) {
  const client = await getSlackClient(userId);
  if (!client) return [];

  const result = await client.conversations.history({ channel: channelId, limit });
  const messages = result.messages ?? [];

  const userIds = [...new Set(messages.map((m) => m.user).filter(Boolean))] as string[];
  const users: Record<string, string> = {};

  for (const uid of userIds) {
    try {
      const info = await client.users.info({ user: uid });
      users[uid] = info.user?.real_name ?? info.user?.name ?? uid;
    } catch {
      users[uid] = uid;
    }
  }

  return messages
    .filter((m) => m.text && !m.subtype)
    .reverse()
    .map((m) => ({
      externalId: m.ts!,
      speaker: m.user ? users[m.user] ?? m.user : "Unknown",
      content: m.text!,
      sentAt: new Date(parseFloat(m.ts!) * 1000),
    }));
}

export async function handleSlackMessage(
  channelId: string,
  message: {
    ts: string;
    user?: string;
    text?: string;
  }
) {
  const activeSessions = await db.captureSession.findMany({
    where: {
      status: "ACTIVE",
      sourceType: "SLACK",
      sourceRef: channelId,
    },
  });

  if (activeSessions.length === 0 || !message.text) return;

  for (const session of activeSessions) {
    const existing = await db.message.findFirst({
      where: { sessionId: session.id, externalId: message.ts },
    });
    if (existing) continue;

    let speaker = "Unknown";
    const integration = await db.integration.findUnique({
      where: { userId_provider: { userId: session.userId, provider: "SLACK" } },
    });

    if (integration && message.user) {
      const client = new WebClient(integration.accessToken);
      try {
        const info = await client.users.info({ user: message.user });
        speaker = info.user?.real_name ?? info.user?.name ?? message.user;
      } catch {
        speaker = message.user;
      }
    }

    await db.message.create({
      data: {
        sessionId: session.id,
        externalId: message.ts,
        speaker,
        content: message.text,
        sentAt: new Date(parseFloat(message.ts) * 1000),
      },
    });

    await enqueueIntentExtraction(session.id);
    scheduleLiveNotesUpdate(session.id);
  }
}

export function verifySlackSignature(
  signingSecret: string,
  signature: string,
  timestamp: string,
  body: string
): boolean {
  const crypto = require("crypto");
  const fiveMinutesAgo = Math.floor(Date.now() / 1000) - 60 * 5;
  if (parseInt(timestamp, 10) < fiveMinutesAgo) return false;

  const sigBasestring = `v0:${timestamp}:${body}`;
  const mySignature =
    "v0=" +
    crypto.createHmac("sha256", signingSecret).update(sigBasestring).digest("hex");

  return crypto.timingSafeEqual(
    Buffer.from(mySignature),
    Buffer.from(signature)
  );
}
