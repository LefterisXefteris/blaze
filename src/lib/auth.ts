import type { User as SupabaseUser } from "@supabase/supabase-js";
import { db } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";

export type AppUser = {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
};

export type AppSession = {
  user: AppUser;
};

function profileFromSupabaseUser(user: SupabaseUser) {
  const meta = user.user_metadata ?? {};
  return {
    id: user.id,
    email: user.email ?? null,
    name:
      (meta.full_name as string | undefined) ??
      (meta.name as string | undefined) ??
      null,
    image: (meta.avatar_url as string | undefined) ?? null,
  };
}

export async function ensureDbUser(user: SupabaseUser) {
  const profile = profileFromSupabaseUser(user);

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
      refreshToken: session.provider_refresh_token ?? undefined,
      expiresAt,
    },
  });
}

export async function auth(): Promise<AppSession | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const dbUser = await ensureDbUser(user);

  return {
    user: {
      id: dbUser.id,
      name: dbUser.name,
      email: dbUser.email,
      image: dbUser.image,
    },
  };
}

export async function signInWithGoogle(redirectTo: string) {
  const supabase = await createClient();

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo,
      scopes:
        "https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile",
      queryParams: {
        access_type: "offline",
        prompt: "consent",
      },
    },
  });

  if (error) throw error;
  return data.url;
}

export function appOrigin() {
  return (
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.AUTH_URL ??
    "http://localhost:3000"
  );
}
