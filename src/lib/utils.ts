import { auth } from "@/lib/auth";

export async function requireAuth() {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }
  return session;
}

export function parseManualTranscript(text: string): Array<{
  speaker: string;
  content: string;
}> {
  const lines = text.split("\n").filter((l) => l.trim());
  const messages: Array<{ speaker: string; content: string }> = [];

  for (const line of lines) {
    const match = line.match(/^([^:]{1,40}):\s*(.+)$/);
    if (match) {
      messages.push({ speaker: match[1].trim(), content: match[2].trim() });
    } else if (messages.length > 0) {
      messages[messages.length - 1].content += " " + line.trim();
    } else {
      messages.push({ speaker: "Unknown", content: line.trim() });
    }
  }

  return messages;
}
