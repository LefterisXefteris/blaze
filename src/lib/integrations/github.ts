import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import type { GitHubIntegrationMetadata } from "@/lib/types";

const GITHUB_API = "https://api.github.com";

export type GitHubComment = {
  id: number;
  user: { login: string } | null;
  body: string;
  created_at: string;
};

export type GitHubIssue = {
  number: number;
  title: string;
  body: string | null;
  html_url: string;
  user: { login: string } | null;
  labels: Array<{ name: string }>;
  assignees: Array<{ login: string }>;
  pull_request?: { url: string };
};

export async function getGitHubToken(userId: string): Promise<string | null> {
  const integration = await db.integration.findUnique({
    where: { userId_provider: { userId, provider: "GITHUB" } },
  });
  return integration?.accessToken ?? null;
}

export async function getGitHubMetadata(
  userId: string
): Promise<GitHubIntegrationMetadata> {
  const integration = await db.integration.findUnique({
    where: { userId_provider: { userId, provider: "GITHUB" } },
  });
  return (integration?.metadata as GitHubIntegrationMetadata) ?? {};
}

export async function isGitHubConnected(userId: string) {
  const token = await getGitHubToken(userId);
  return !!token;
}

export async function saveGitHubIntegration(
  userId: string,
  accessToken: string,
  metadata: GitHubIntegrationMetadata
) {
  await db.integration.upsert({
    where: { userId_provider: { userId, provider: "GITHUB" } },
    create: {
      userId,
      provider: "GITHUB",
      accessToken,
      metadata: {
        autoAssign: true,
        autoMention: true,
        autoReview: true,
        autoAckMention: true,
        ...metadata,
      } as Prisma.InputJsonValue,
    },
    update: {
      accessToken,
      metadata: {
        autoAssign: true,
        autoMention: true,
        autoReview: true,
        autoAckMention: true,
        ...metadata,
      } as Prisma.InputJsonValue,
    },
  });
}

export async function updateGitHubSettings(
  userId: string,
  settings: Partial<GitHubIntegrationMetadata>
) {
  const existing = await getGitHubMetadata(userId);
  await db.integration.update({
    where: { userId_provider: { userId, provider: "GITHUB" } },
    data: {
      metadata: { ...existing, ...settings } as Prisma.InputJsonValue,
    },
  });
}

export async function githubFetch<T>(
  token: string,
  path: string,
  init?: RequestInit
): Promise<T> {
  const res = await fetch(`${GITHUB_API}${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...init?.headers,
    },
  });

  if (!res.ok) {
    throw new Error(`GitHub API error: ${res.status} ${await res.text()}`);
  }

  return res.json() as Promise<T>;
}

export async function fetchGitHubUser(token: string) {
  return githubFetch<{ login: string; id: number; avatar_url: string }>(
    token,
    "/user"
  );
}

export async function fetchIssueOrPull(
  token: string,
  repo: string,
  number: number
): Promise<GitHubIssue> {
  return githubFetch<GitHubIssue>(token, `/repos/${repo}/issues/${number}`);
}

export async function fetchIssueComments(
  token: string,
  repo: string,
  number: number
): Promise<GitHubComment[]> {
  return githubFetch<GitHubComment[]>(
    token,
    `/repos/${repo}/issues/${number}/comments`
  );
}

export async function postIssueComment(
  userId: string,
  repo: string,
  issueNumber: number,
  body: string
) {
  const token = await getGitHubToken(userId);
  if (!token) throw new Error("GitHub not connected");

  return githubFetch<{ id: number; html_url: string }>(
    token,
    `/repos/${repo}/issues/${issueNumber}/comments`,
    {
      method: "POST",
      body: JSON.stringify({ body }),
    }
  );
}

export async function addIssueLabels(
  userId: string,
  repo: string,
  issueNumber: number,
  labels: string[]
) {
  const token = await getGitHubToken(userId);
  if (!token) throw new Error("GitHub not connected");

  return githubFetch<unknown>(
    token,
    `/repos/${repo}/issues/${issueNumber}/labels`,
    {
      method: "POST",
      body: JSON.stringify({ labels }),
    }
  );
}

export async function findUserByGitHubLogin(login: string) {
  const integrations = await db.integration.findMany({
    where: { provider: "GITHUB" },
  });

  for (const integration of integrations) {
    const meta = integration.metadata as GitHubIntegrationMetadata;
    if (meta.githubLogin?.toLowerCase() === login.toLowerCase()) {
      return integration.userId;
    }
  }

  return null;
}

export function externalIdForIssue(repo: string, number: number) {
  return `${repo}#${number}`;
}
