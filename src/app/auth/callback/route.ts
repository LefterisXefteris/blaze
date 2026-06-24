import { NextResponse } from "next/server";
import { appOrigin, completeGoogleOAuth } from "@/lib/auth";
import { setSessionCookie } from "@/lib/session";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  let next = "/notes";

  const state = searchParams.get("state");
  if (state) {
    try {
      const parsed = JSON.parse(
        Buffer.from(state, "base64url").toString("utf-8")
      ) as { next?: string };
      if (parsed.next) next = parsed.next;
    } catch {
      // ignore malformed state
    }
  }

  if (!code) {
    return NextResponse.redirect(`${appOrigin()}/login?error=oauth`);
  }

  try {
    const { accessToken } = await completeGoogleOAuth(code);
    const response = NextResponse.redirect(`${appOrigin()}${next}`);
    setSessionCookie(response, accessToken);
    return response;
  } catch {
    return NextResponse.redirect(`${appOrigin()}/login?error=oauth`);
  }
}
