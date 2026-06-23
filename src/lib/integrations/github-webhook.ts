import crypto from "crypto";
import { db } from "@/lib/db";
import { processGitHubEvent } from "@/lib/agent/github-processor";

export function verifyGitHubSignature(
  payload: string,
  signature: string | null,
  secret: string
): boolean {
  if (!signature) return false;

  const expected =
    "sha256=" +
    crypto.createHmac("sha256", secret).update(payload).digest("hex");

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expected)
    );
  } catch {
    return false;
  }
}

export async function handleGitHubWebhook(
  deliveryId: string,
  event: string,
  payload: Record<string, unknown>
) {
  const existing = await db.webhookDelivery.findUnique({
    where: { id: deliveryId },
  });
  if (existing) return;

  await db.webhookDelivery.create({
    data: { id: deliveryId, provider: "github" },
  });

  await processGitHubEvent(event, payload);
}
