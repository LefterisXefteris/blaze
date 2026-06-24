import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import type { NextRequest, NextResponse } from "next/server";
import type { RequestCookies } from "next/dist/compiled/@edge-runtime/cookies";

export const AUTH_COOKIE = "blaze-auth-token";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7;

function decodeBase64Url(value: string): string {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

function encodeBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export type SessionClaims = JWTPayload & {
  sub: string;
  email?: string;
  user_metadata?: {
    full_name?: string;
    name?: string;
    avatar_url?: string;
  };
};

function jwtSecret() {
  const secret = process.env.BLAZE_JWT_SECRET;
  if (!secret?.trim()) {
    throw new Error("BLAZE_JWT_SECRET is not set");
  }
  return new TextEncoder().encode(secret);
}

export async function signAccessToken(profile: {
  id: string;
  email: string | null;
  name: string | null;
  image: string | null;
}): Promise<string> {
  return new SignJWT({
    email: profile.email ?? undefined,
    user_metadata: {
      full_name: profile.name ?? undefined,
      avatar_url: profile.image ?? undefined,
    },
  })
    .setSubject(profile.id)
    .setProtectedHeader({ alg: "HS256" })
    .setAudience("authenticated")
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(jwtSecret());
}

export async function verifyAccessToken(token: string): Promise<SessionClaims> {
  const { payload } = await jwtVerify(token, jwtSecret(), {
    audience: "authenticated",
  });
  if (!payload.sub) {
    throw new Error("Invalid token");
  }
  return payload as SessionClaims;
}

function parseAuthCookieValue(raw: string): string | null {
  try {
    const json = raw.startsWith("base64-")
      ? decodeBase64Url(raw.slice(7))
      : raw;
    const parsed = JSON.parse(json) as
      | { access_token?: string }
      | [string, ...unknown[]];
    if (Array.isArray(parsed) && typeof parsed[0] === "string") {
      return parsed[0];
    }
    if (
      typeof parsed === "object" &&
      parsed &&
      typeof parsed.access_token === "string"
    ) {
      return parsed.access_token;
    }
  } catch {
    if (raw.split(".").length === 3) {
      return raw;
    }
  }
  return null;
}

type CookieSource = RequestCookies | { getAll: () => { name: string; value: string }[] };

export function getBlazeAccessTokenFromCookies(cookies: CookieSource): string | null {
  const blaze = cookies.getAll().find((cookie) => cookie.name === AUTH_COOKIE);
  if (!blaze?.value) return null;
  return parseAuthCookieValue(blaze.value);
}

export function getAccessTokenFromCookies(cookies: CookieSource): string | null {
  const blazeToken = getBlazeAccessTokenFromCookies(cookies);
  if (blazeToken) return blazeToken;

  const authCookies: { idx: number; value: string }[] = [];
  for (const cookie of cookies.getAll()) {
    if (!cookie.name.includes("-auth-token") || cookie.name === AUTH_COOKIE) continue;
    const match = cookie.name.match(/\.(\d+)$/);
    authCookies.push({
      idx: match ? Number(match[1]) : 0,
      value: cookie.value,
    });
  }
  if (!authCookies.length) return null;
  authCookies.sort((a, b) => a.idx - b.idx);
  return parseAuthCookieValue(authCookies.map((c) => c.value).join(""));
}

export function getAccessTokenFromRequest(request: NextRequest): string | null {
  return getBlazeAccessTokenFromCookies(request.cookies);
}

export function setSessionCookie(response: NextResponse, accessToken: string) {
  const value = `base64-${encodeBase64Url(JSON.stringify({ access_token: accessToken }))}`;
  response.cookies.set(AUTH_COOKIE, value, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: COOKIE_MAX_AGE,
  });
}

export function clearAllAuthCookies(
  response: NextResponse,
  request: NextRequest
) {
  response.cookies.delete(AUTH_COOKIE);
  for (const cookie of request.cookies.getAll()) {
    if (cookie.name.startsWith("sb-") || cookie.name.includes("-auth-token")) {
      response.cookies.delete(cookie.name);
    }
  }
}

export function profileFromClaims(claims: SessionClaims) {
  const meta = claims.user_metadata ?? {};
  return {
    id: claims.sub,
    email: claims.email ?? null,
    name: meta.full_name ?? meta.name ?? null,
    image: meta.avatar_url ?? null,
  };
}
