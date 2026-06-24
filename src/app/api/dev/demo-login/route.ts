import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { appOrigin } from "@/lib/auth";
import { localSetupHint, localSetupIssues } from "@/lib/env-setup";
import { setSessionCookie, signAccessToken } from "@/lib/session";

const DEMO_USER_ID = "00000000-0000-4000-8000-000000000001";
const DEMO_EMAIL = "demo@blaze.local";

const DEMO_TRANSCRIPT = [
  "Alex: Let's sync Tuesday at 3pm to review the roadmap.",
  "You: Sounds good. I'll send the deck by Friday.",
  "Alex: Can you draft a recap email to the client after we meet?",
].join("\n");

function configErrorHtml(message: string, hint: string, status = 503) {
  const body = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><title>Blaze setup</title>
<style>body{font-family:system-ui,sans-serif;max-width:32rem;margin:3rem auto;padding:0 1rem;line-height:1.5}
.card{border:1px solid #333;border-radius:8px;padding:1.25rem;background:#111;color:#eee}
a{color:#7cb3ff}</style></head><body>
<div class="card"><h1>Could not sign in</h1><p>${message}</p><p>${hint}</p>
<p><a href="/login">Back to login</a></p></div></body></html>`;
  return new NextResponse(body, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

async function seedDemoSession(accessToken: string) {
  const apiUrl = process.env.API_URL ?? "http://127.0.0.1:8000";
  const response = await fetch(`${apiUrl}/api/sessions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      title: "Product sync with Alex",
      sourceType: "MANUAL",
      transcript: DEMO_TRANSCRIPT,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to seed demo session (${response.status})`);
  }
}

export async function GET() {
  if (process.env.DEV_DEMO_LOGIN !== "true") {
    return NextResponse.json({ error: "Demo login disabled" }, { status: 403 });
  }

  const setupIssues = localSetupIssues();
  if (setupIssues.length > 0) {
    return configErrorHtml(
      `Local setup incomplete: ${setupIssues.join("; ")}`,
      localSetupHint()
    );
  }

  try {
    let dbUser = await db.user.findUnique({ where: { email: DEMO_EMAIL } });
    if (!dbUser) {
      dbUser = await db.user.upsert({
        where: { id: DEMO_USER_ID },
        create: {
          id: DEMO_USER_ID,
          email: DEMO_EMAIL,
          name: "Demo User",
          image: null,
        },
        update: {
          name: "Demo User",
        },
      });
    } else {
      dbUser = await db.user.update({
        where: { id: dbUser.id },
        data: { name: dbUser.name ?? "Demo User" },
      });
    }

    const accessToken = await signAccessToken({
      id: dbUser.id,
      email: dbUser.email,
      name: dbUser.name,
      image: dbUser.image,
    });

    const existingSessions = await db.captureSession.count({
      where: { userId: dbUser.id },
    });

    if (existingSessions === 0) {
      await seedDemoSession(accessToken);
    }

    const response = NextResponse.redirect(new URL("/notes", appOrigin()));
    setSessionCookie(response, accessToken);
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sign-in failed";
    const dbHint = message.includes("Can't reach database server")
      ? "Start Postgres with <code>docker compose up postgres -d</code>, then run <code>npm run db:setup</code>."
      : message.includes("Unique constraint") || message.includes("email")
        ? "A demo user already exists in the database — this is fixed; restart <code>npm run dev:all</code> and try Enter demo again."
        : localSetupHint();
    return configErrorHtml(message, dbHint);
  }
}
