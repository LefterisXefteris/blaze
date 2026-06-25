import { NextResponse, type NextRequest } from "next/server";
import {
  AUTH_COOKIE,
  clearAllAuthCookies,
  getAccessTokenFromRequest,
  verifyAccessToken,
} from "@/lib/session";

const PUBLIC_PATHS = [
  "/",
  "/login",
  "/auth/callback",
  "/api/dev/demo-login",
  "/api/auth/signout",
  "/api/slack/events",
  "/api/slack/interactions",
  "/api/github/webhook",
];

function isIntegrationOAuthCallback(pathname: string) {
  return /^\/api\/integrations\/[^/]+\/callback$/.test(pathname);
}

function isPublicPath(pathname: string) {
  if (isIntegrationOAuthCallback(pathname)) {
    return true;
  }
  return PUBLIC_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`)
  );
}

function isAuthPage(pathname: string) {
  return pathname === "/login" || pathname.startsWith("/auth/");
}

function isApiPath(pathname: string) {
  return pathname.startsWith("/api/");
}

function unauthorizedApiResponse() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function updateSession(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (/\.(png|jpg|jpeg|gif|webp|svg|ico)$/i.test(pathname)) {
    return NextResponse.next();
  }

  // Drop legacy Supabase cookies so they cannot trigger verify loops.
  const hasLegacyAuthCookie = request.cookies
    .getAll()
    .some(
      (cookie) =>
        cookie.name.startsWith("sb-") ||
        (cookie.name.includes("-auth-token") && cookie.name !== AUTH_COOKIE)
    );

  const token = getAccessTokenFromRequest(request);
  let userId: string | null = null;

  if (token) {
    try {
      const claims = await verifyAccessToken(token);
      userId = claims.sub;
    } catch {
      if (isApiPath(pathname)) {
        const response = unauthorizedApiResponse();
        clearAllAuthCookies(response, request);
        return response;
      }
      if (isAuthPage(pathname)) {
        const response = NextResponse.next();
        clearAllAuthCookies(response, request);
        return response;
      }
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = "/login";
      loginUrl.searchParams.set("error", "session");
      const response = NextResponse.redirect(loginUrl);
      clearAllAuthCookies(response, request);
      return response;
    }
  }

  if (!userId && !isPublicPath(pathname)) {
    if (isApiPath(pathname)) {
      return unauthorizedApiResponse();
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (hasLegacyAuthCookie && !token) {
    const response = NextResponse.next();
    clearAllAuthCookies(response, request);
    return response;
  }

  return NextResponse.next();
}
