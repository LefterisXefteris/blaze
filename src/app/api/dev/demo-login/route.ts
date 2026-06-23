import { NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { db } from "@/lib/db";
import { enqueueIntentExtraction } from "@/lib/queue";
import { createClient } from "@/lib/supabase/server";
import { appOrigin, ensureDbUser } from "@/lib/auth";

const DEMO_EMAIL = "demo@blaze.local";
const DEMO_PASSWORD = "blaze-demo-password";

export async function GET() {
  if (process.env.DEV_DEMO_LOGIN !== "true") {
    return NextResponse.json({ error: "Demo login disabled" }, { status: 403 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json(
      {
        error:
          "Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY for demo login",
      },
      { status: 503 }
    );
  }

  const admin = createAdminClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: existingUsers } = await admin.auth.admin.listUsers();
  const demoAuthUser = existingUsers.users.find((u) => u.email === DEMO_EMAIL);

  if (!demoAuthUser) {
    const { error } = await admin.auth.admin.createUser({
      email: DEMO_EMAIL,
      password: DEMO_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: "Demo User" },
    });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  const supabase = await createClient();
  const { data, error: signInError } = await supabase.auth.signInWithPassword({
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
  });

  if (signInError || !data.user) {
    return NextResponse.json(
      { error: signInError?.message ?? "Demo sign-in failed" },
      { status: 500 }
    );
  }

  const dbUser = await ensureDbUser(data.user);

  const existingSessions = await db.captureSession.count({
    where: { userId: dbUser.id },
  });

  if (existingSessions === 0) {
    const captureSession = await db.captureSession.create({
      data: {
        userId: dbUser.id,
        title: "Product sync with Alex",
        sourceType: "MANUAL",
      },
    });

    const messages = [
      { speaker: "Alex", content: "Let's sync Tuesday at 3pm to review the roadmap." },
      { speaker: "You", content: "Sounds good. I'll send the deck by Friday." },
      {
        speaker: "Alex",
        content: "Can you draft a recap email to the client after we meet?",
      },
    ];

    for (const msg of messages) {
      await db.message.create({
        data: { sessionId: captureSession.id, ...msg },
      });
    }

    await enqueueIntentExtraction(captureSession.id);
  }

  return NextResponse.redirect(new URL("/notes", appOrigin()));
}
