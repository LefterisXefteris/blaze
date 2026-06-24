import { randomUUID } from "crypto";
import { cookies } from "next/headers";
import { google } from "googleapis";
import { db } from "@/lib/db";
import {
  getAccessTokenFromCookies,
  profileFromClaims,
  signAccessToken,
  verifyAccessToken,
} from "@/lib/session";

export type AppUser = {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
};

export type AppSession = {
  user: AppUser;
};

export type UserProfile = AppUser;

export async function ensureDbUser(profile: UserProfile) {
  return db.user.upsert({
    where: { id: profile.id },
    create: profile,
    update: {
      email: profile.email,
      name: profile.name,
      image: profile.image,
    },
  });
}

export async function syncGoogleTokens(
  userId: string,
  session: {
    provider_token?: string | null;
    provider_refresh_token?: string | null;
    expires_in?: number | null;
  }
) {
  if (!session.provider_token) return;

  const expiresAt = session.expires_in
    ? new Date(Date.now() + session.expires_in * 1000)
    : null;

  await db.integration.upsert({
    where: {
      userId_provider: { userId, provider: "GOOGLE_CALENDAR" },
    },
    create: {
      userId,
      provider: "GOOGLE_CALENDAR",
      accessToken: session.provider_token,
      refreshToken: session.provider_refresh_token ?? null,
      expiresAt,
    },
    update: {
      accessToken: session.provider_token,
      ...(session.provider_refresh_token
        ? { refreshToken: session.provider_refresh_token }
        : {}),
      expiresAt,
    },
  });
}

export async function auth(): Promise<AppSession | null> {
  const cookieStore = await cookies();
  const token = getAccessTokenFromCookies(cookieStore);
  if (!token) return null;

  try {
    const claims = await verifyAccessToken(token);
    const profile = profileFromClaims(claims);
    const dbUser = await ensureDbUser(profile);
    return {
      user: {
        id: dbUser.id,
        name: dbUser.name,
        email: dbUser.email,
        image: dbUser.image,
      },
    };
  } catch {
    return null;
  }
}

export function googleOAuthConfigured() {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID?.trim() &&
      process.env.GOOGLE_CLIENT_SECRET?.trim()
  );
}

export async function signInWithGoogle(redirectTo: string) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Google OAuth is not configured");
  }

  const oauth2 = new google.auth.OAuth2(clientId, clientSecret, redirectTo);
  return oauth2.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [
      "https://www.googleapis.com/auth/userinfo.email",
      "https://www.googleapis.com/auth/userinfo.profile",
      "https://www.googleapis.com/auth/calendar.events",
    ],
    state: Buffer.from(JSON.stringify({ next: "/notes" })).toString("base64url"),
  });
}

export async function completeGoogleOAuth(code: string) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Google OAuth is not configured");
  }

  const redirectUri = `${appOrigin()}/auth/callback`;
  const oauth2 = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  const { tokens } = await oauth2.getToken(code);
  oauth2.setCredentials(tokens);

  const oauth2Api = google.oauth2({ version: "v2", auth: oauth2 });
  const { data: googleUser } = await oauth2Api.userinfo.get();
  if (!googleUser.email) {
    throw new Error("Google account has no email");
  }

  let dbUser = await db.user.findUnique({ where: { email: googleUser.email } });
  if (!dbUser) {
    dbUser = await db.user.create({
      data: {
        id: randomUUID(),
        email: googleUser.email,
        name: googleUser.name ?? null,
        image: googleUser.picture ?? null,
      },
    });
  } else {
    dbUser = await db.user.update({
      where: { id: dbUser.id },
      data: {
        name: googleUser.name ?? dbUser.name,
        image: googleUser.picture ?? dbUser.image,
      },
    });
  }

  await syncGoogleTokens(dbUser.id, {
    provider_token: tokens.access_token,
    provider_refresh_token: tokens.refresh_token,
    expires_in: tokens.expiry_date
      ? Math.floor((tokens.expiry_date - Date.now()) / 1000)
      : null,
  });

  const accessToken = await signAccessToken({
    id: dbUser.id,
    email: dbUser.email,
    name: dbUser.name,
    image: dbUser.image,
  });

  return { dbUser, accessToken };
}

export function appOrigin() {
  return (
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.AUTH_URL ??
    "http://localhost:3010"
  );
}
