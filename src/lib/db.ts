import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

function createPrismaClient() {
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL!,
  });
  return new PrismaClient({ adapter });
}

// In dev, avoid caching a stale client across hot reloads (e.g. after enum changes).
export const db =
  process.env.NODE_ENV === "production"
    ? (globalForPrisma.prisma ?? createPrismaClient())
    : createPrismaClient();

if (process.env.NODE_ENV === "production" && !globalForPrisma.prisma) {
  globalForPrisma.prisma = db;
}
