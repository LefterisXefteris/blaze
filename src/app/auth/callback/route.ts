import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { appOrigin, ensureDbUser, syncGoogleTokens } from "@/lib/auth";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/notes";

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.session?.user) {
      await ensureDbUser(data.session.user);
      await syncGoogleTokens(data.session.user.id, {
        provider_token: data.session.provider_token,
        provider_refresh_token: data.session.provider_refresh_token,
        expires_in: data.session.expires_in,
      });
    }
  }

  const forwardedHost = request.headers.get("x-forwarded-host");
  const isLocalEnv = process.env.NODE_ENV === "development";

  if (isLocalEnv) {
    return NextResponse.redirect(`${appOrigin()}${next}`);
  }

  if (forwardedHost) {
    return NextResponse.redirect(`https://${forwardedHost}${next}`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
