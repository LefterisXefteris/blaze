import { redirect } from "next/navigation";
import { appOrigin, signInWithGoogle } from "@/lib/auth";
import { BlazeLogo } from "@/components/blaze-logo";

const demoEnabled = process.env.DEV_DEMO_LOGIN === "true";

export default function LoginPage() {
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

        {demoEnabled && (
          <a
            href="/api/dev/demo-login"
            className="block w-full px-4 py-3 btn-primary text-sm text-center"
          >
            Enter demo
          </a>
        )}

        <form
          action={async () => {
            "use server";
            const url = await signInWithGoogle(
              `${appOrigin()}/auth/callback`
            );
            if (url) redirect(url);
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

        <p className="text-xs text-muted text-center">
          {demoEnabled
            ? "Demo mode — or sign in with Supabase Google OAuth"
            : "Powered by Supabase Auth · includes Google Calendar access"}
        </p>
      </div>
    </div>
  );
}
