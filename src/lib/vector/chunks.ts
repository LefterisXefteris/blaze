const MAX_CHUNK_CHARS = 1800;

export function splitIntoChunks(text: string, maxChars = MAX_CHUNK_CHARS): string[] {
  const normalized = text.trim();
  if (!normalized) return [];
  if (normalized.length <= maxChars) return [normalized];

  const paragraphs = normalized.split(/\n{2,}/);
  const chunks: string[] = [];
  let current = "";

  for (const paragraph of paragraphs) {
    const piece = paragraph.trim();
    if (!piece) continue;

    if (piece.length > maxChars) {
      if (current) {
        chunks.push(current.trim());
        current = "";
      }
      for (let i = 0; i < piece.length; i += maxChars) {
        chunks.push(piece.slice(i, i + maxChars));
      }
      continue;
    }

    if ((current + "\n\n" + piece).length > maxChars) {
      if (current) chunks.push(current.trim());
      current = piece;
    } else {
      current = current ? `${current}\n\n${piece}` : piece;
    }
  }

  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

export function buildGitHubIndexText(params: {
  repo: string;
  number: number;
  title: string;
  itemType: string;
  aiSummary?: string | null;
  body?: string | null;
  comments?: Array<{ speaker: string; content: string }>;
}): { purpose: string; chunks: string[] } {
  const label = params.itemType === "pull_request" ? "Pull request" : "Issue";
  const purpose =
    params.aiSummary?.trim() ||
    `${label} ${params.repo}#${params.number}: ${params.title}`;

  const header = [
    `Purpose: ${purpose}`,
    `${label}: ${params.repo}#${params.number}`,
    `Title: ${params.title}`,
    params.body?.trim() ? `Description:\n${params.body.trim()}` : null,
    params.aiSummary?.trim() ? `Summary:\n${params.aiSummary.trim()}` : null,
  ]
    .filter(Boolean)
    .join("\n\n");

  const commentBlock =
    params.comments && params.comments.length > 0
      ? `Comments:\n${params.comments
          .slice(-12)
          .map((c) => `${c.speaker}: ${c.content}`)
          .join("\n")}`
      : "";

  const full = [header, commentBlock].filter(Boolean).join("\n\n");
  return { purpose, chunks: splitIntoChunks(full) };
}

export function buildMeetingIndexText(params: {
  title?: string | null;
  aiSummary: string;
  decisions?: string[];
  actionItems?: Array<{ text: string }>;
}): { purpose: string; chunks: string[] } {
  const purpose = params.aiSummary.split("\n")[0]?.slice(0, 240) || params.title || "Meeting notes";
  const body = [
    params.title ? `Meeting: ${params.title}` : null,
    `Summary:\n${params.aiSummary}`,
    params.decisions?.length
      ? `Decisions:\n${params.decisions.map((d) => `- ${d}`).join("\n")}`
      : null,
    params.actionItems?.length
      ? `Action items:\n${params.actionItems.map((a) => `- ${a.text}`).join("\n")}`
      : null,
  ]
    .filter(Boolean)
    .join("\n\n");

  return { purpose, chunks: splitIntoChunks(body) };
}
