#!/usr/bin/env node
import "dotenv/config";
import { Worker } from "bullmq";
import { processSessionIntents } from "@/lib/agent/action-executor";

const REDIS_URL = process.env.REDIS_URL;
if (!REDIS_URL) {
  console.error("REDIS_URL is required. Example: redis://localhost:6379");
  process.exit(1);
}

const worker = new Worker(
  "intent-extraction",
  async (job) => {
    const { sessionId } = job.data as { sessionId: string };
    await processSessionIntents(sessionId);
  },
  {
    connection: { url: REDIS_URL },
  }
);

worker.on("completed", (job) => {
  console.log(`Intent extraction completed for ${job.data.sessionId}`);
});

worker.on("failed", (job, err) => {
  console.error(
    `Intent extraction failed for ${job?.data?.sessionId ?? "unknown"}:`,
    err
  );
});

async function shutdown() {
  console.log("Shutting down worker...");
  await worker.close();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

console.log("Intent extraction worker listening on queue: intent-extraction");
