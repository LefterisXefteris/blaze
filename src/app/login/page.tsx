import { redirect } from "next/navigation";
import { appOrigin, googleOAuthConfigured, signInWithGoogle } from "@/lib/auth";
import { BlazeLogo } from "@/components/blaze-logo";
import { localSetupHint, localSetupIssues } from "@/lib/env-setup";

const demoEnabled = process.env.DEV_DEMO_LOGIN === "true";
const googleEnabled = googleOAuthConfigured();

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const setupIssues = localSetupIssues();
  const params = await searchParams;
  const sessionError = params.error === "session";
  const oauthError = params.error === "oauth";

  return (
    <div className="login-bg min-h-screen flex items-center justify-center px-4">
      <div className="max-w-sm w-full card p-8 space-y-6">
        <div className="flex flex-col items-center">
          <BlazeLogo size={96} linked={false} className="mb-6" />
          <h1 className="text-xl font-semibold tracking-tight">Welcome to Blaze</h1>
          <p className="text-muted text-sm mt-2">
            Agentic AI note-taking. Capture conversations, auto-act on calendar
            and tasks.
          </p>
        </div>

        {sessionError && (
          <p className="text-sm text-blaze-red card p-3">
            Session was invalid and has been cleared. Try signing in again.
          </p>
        )}

        {oauthError && (
          <p className="text-sm text-blaze-red card p-3">
            Google sign-in failed. Check GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in
            .env, or use demo login.
          </p>
        )}

        {setupIssues.length > 0 && (
          <div className="text-sm card p-3 bg-surface-muted/30 space-y-2">
            <p className="font-medium text-blaze-red">Local setup incomplete</p>
            <ul className="text-xs text-muted list-disc pl-4 space-y-1">
              {setupIssues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
            <p className="text-xs text-muted">{localSetupHint()}</p>
          </div>
        )}

        {demoEnabled && (
          <a
            href="/api/dev/demo-login"
            className="block w-full px-4 py-3 btn-primary text-sm text-center"
          >
            Enter demo
          </a>
        )}

        {googleEnabled && (
          <form
            action={async () => {
              "use server";
              try {
                const url = await signInWithGoogle(
                  `${appOrigin()}/auth/callback`
                );
                if (url) redirect(url);
              } catch {
                redirect("/login?error=oauth");
              }
            }}
          >
            <button
              type="submit"
              className={`w-full px-4 py-3 text-sm ${
                demoEnabled ? "btn-secondary" : "btn-primary"
              }`}
            >
              Sign in with Google
            </button>
          </form>
        )}

        <p className="text-xs text-muted text-center">
          {demoEnabled
            ? "Demo mode stores data in local Postgres."
            : "Configure DEV_DEMO_LOGIN or Google OAuth in .env."}
        </p>
      </div>
    </div>
  );
}
