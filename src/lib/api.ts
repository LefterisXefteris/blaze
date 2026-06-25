const NOTES_SESSION_KEY = "blaze-notes-session-id";

/** Delete a capture session and its note. */
export async function deleteSession(sessionId: string): Promise<boolean> {
  const res = await fetch(`/api/sessions/${sessionId}`, {
    method: "DELETE",
    credentials: "same-origin",
  });
  if (!res.ok) return false;

  if (typeof window !== "undefined" && localStorage.getItem(NOTES_SESSION_KEY) === sessionId) {
    localStorage.removeItem(NOTES_SESSION_KEY);
  }

  return true;
}

/** Parse JSON from a fetch response without throwing on HTML error pages. */
export async function readJsonResponse<T>(res: Response): Promise<T | null> {
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return null;
  }

  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}
