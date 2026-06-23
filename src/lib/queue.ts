import { processSessionIntents } from "@/lib/agent/action-executor";
import { updateSessionLiveSummary } from "@/lib/agent/live-notes";

const pendingJobs = new Map<string, ReturnType<typeof setTimeout>>();
const pendingLiveNotes = new Map<string, ReturnType<typeof setTimeout>>();
const DEBOUNCE_MS = 2000;
const LIVE_NOTES_DEBOUNCE_MS = 4000;

let redisQueue: import("bullmq").Queue | null = null;
let redisDisabled = false;

function disableRedis() {
  redisDisabled = true;
  if (redisQueue) {
    void redisQueue.close().catch(() => undefined);
    redisQueue = null;
  }
}

async function getRedisQueue() {
  if (redisDisabled || !process.env.REDIS_URL) return null;
  if (redisQueue) return redisQueue;

  try {
    const { Queue } = await import("bullmq");
    redisQueue = new Queue("intent-extraction", {
      connection: {
        url: process.env.REDIS_URL,
        maxRetriesPerRequest: 1,
        connectTimeout: 2000,
        retryStrategy: () => null,
      },
    });
    redisQueue.on("error", disableRedis);
    return redisQueue;
  } catch {
    disableRedis();
    return null;
  }
}

export function scheduleIntentExtraction(sessionId: string) {
  const existing = pendingJobs.get(sessionId);
  if (existing) clearTimeout(existing);

  const timer = setTimeout(async () => {
    pendingJobs.delete(sessionId);
    try {
      await processSessionIntents(sessionId);
    } catch (error) {
      console.error(`Intent extraction failed for ${sessionId}:`, error);
    }
  }, DEBOUNCE_MS);

  pendingJobs.set(sessionId, timer);
}

export function scheduleLiveNotesUpdate(sessionId: string) {
  const existing = pendingLiveNotes.get(sessionId);
  if (existing) clearTimeout(existing);

  const timer = setTimeout(async () => {
    pendingLiveNotes.delete(sessionId);
    try {
      await updateSessionLiveSummary(sessionId);
    } catch (error) {
      console.error(`Live notes update failed for ${sessionId}:`, error);
    }
  }, LIVE_NOTES_DEBOUNCE_MS);

  pendingLiveNotes.set(sessionId, timer);
}

export async function enqueueIntentExtraction(sessionId: string) {
  const queue = await getRedisQueue();
  if (queue) {
    try {
      await queue.add(
        "extract",
        { sessionId },
        { jobId: sessionId, delay: DEBOUNCE_MS, removeOnComplete: true }
      );
      return;
    } catch {
      disableRedis();
    }
  }

  scheduleIntentExtraction(sessionId);
}
