"use client";

import { useEffect, useState } from "react";

type RepoMapping = { repo: string; path: string };

function RepoWorkspaceSettings() {
  const [rows, setRows] = useState<RepoMapping[]>([{ repo: "", path: "" }]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/local/repo-workspaces")
      .then((r) => (r.ok ? r.json() : { mappings: {} }))
      .then((data: { mappings?: Record<string, string> }) => {
        const entries = Object.entries(data.mappings ?? {});
        setRows(
          entries.length > 0
            ? entries.map(([repo, path]) => ({ repo, path }))
            : [{ repo: "", path: "" }]
        );
      })
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    setNotice(null);
    const mappings = Object.fromEntries(
      rows
        .map((r) => [r.repo.trim(), r.path.trim()] as const)
        .filter(([repo, path]) => repo && path)
    );
    const res = await fetch("/api/local/repo-workspaces", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mappings }),
    });
    setSaving(false);
    if (res.ok) {
      setNotice("Saved — new handoffs will use these paths.");
    } else {
      setNotice("Could not save mappings (is the API running locally?).");
    }
  };

  if (loading) {
    return <p className="text-sm text-muted mt-3">Loading…</p>;
  }

  return (
    <div className="mt-4 space-y-3">
      {rows.map((row, index) => (
        <div key={index} className="grid gap-2 sm:grid-cols-[1fr_1.4fr_auto] items-end">
          <label className="text-sm">
            <span className="text-muted text-xs">GitHub repo</span>
            <input
              type="text"
              value={row.repo}
              placeholder="ClickHouse/ClickHouse"
              className="mt-1 w-full rounded-md border border-border-subtle bg-surface px-3 py-2 text-sm"
              onChange={(e) => {
                const next = [...rows];
                next[index] = { ...next[index], repo: e.target.value };
                setRows(next);
              }}
            />
          </label>
          <label className="text-sm">
            <span className="text-muted text-xs">Local path</span>
            <input
              type="text"
              value={row.path}
              placeholder="/Users/you/projects/ClickHouse"
              className="mt-1 w-full rounded-md border border-border-subtle bg-surface px-3 py-2 text-sm font-mono"
              onChange={(e) => {
                const next = [...rows];
                next[index] = { ...next[index], path: e.target.value };
                setRows(next);
              }}
            />
          </label>
          <button
            type="button"
            className="text-sm text-muted hover:text-foreground px-2 py-2"
            onClick={() => setRows(rows.filter((_, i) => i !== index))}
            disabled={rows.length === 1}
          >
            Remove
          </button>
        </div>
      ))}
      <div className="flex flex-wrap gap-2 items-center">
        <button
          type="button"
          className="text-sm px-3 py-1.5 rounded-md border border-border-subtle"
          onClick={() => setRows([...rows, { repo: "", path: "" }])}
        >
          Add repo
        </button>
        <button
          type="button"
          className="text-sm px-4 py-1.5 rounded-md btn-primary"
          disabled={saving}
          onClick={() => void save()}
        >
          {saving ? "Saving…" : "Save mappings"}
        </button>
      </div>
      {notice && <p className="text-xs text-muted">{notice}</p>}
      <p className="text-xs text-muted">
        Stored in <code>~/.blaze/repos.json</code>. Override per machine with{" "}
        <code>BLAZE_REPO_MAP=org/repo=/path,other/repo=/path2</code> in <code>.env</code>.
      </p>
    </div>
  );
}

type IntegrationStatus = {
  google: boolean;
  googleConfigured: boolean;
  slack: boolean;
  slackConfigured: boolean;
  appUrl: string;
  github: boolean;
  githubConfigured: boolean;
  githubLogin: string | null;
  githubSettings: {
    autoAssign?: boolean;
    autoMention?: boolean;
    autoReview?: boolean;
    autoAckMention?: boolean;
  } | null;
  slackSettings: {
    teamName?: string;
    autoHuddleCapture?: boolean;
    slackApprovals?: boolean;
    slackLiveNotes?: boolean;
  } | null;
};

export default function SettingsPage() {
  const [slackNotice, setSlackNotice] = useState<string | null>(null);
  const [githubNotice, setGithubNotice] = useState<string | null>(null);
  const [googleNotice, setGoogleNotice] = useState<string | null>(null);

  const [status, setStatus] = useState<IntegrationStatus>({
    google: false,
    googleConfigured: false,
    slack: false,
    slackConfigured: false,
    appUrl: "http://localhost:3010",
    github: false,
    githubConfigured: false,
    githubLogin: null,
    githubSettings: null,
    slackSettings: null,
  });

  const load = () => {
    fetch("/api/integrations/status")
      .then((r) => r.json())
      .then(setStatus);
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setSlackNotice(params.get("slack"));
    setGithubNotice(params.get("github"));
    setGoogleNotice(params.get("google"));
  }, []);

  useEffect(() => {
    load();
  }, []);

  const updateGitHubSetting = async (
    key: "autoAssign" | "autoMention" | "autoReview" | "autoAckMention",
    value: boolean
  ) => {
    await fetch("/api/priority", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ settings: { [key]: value } }),
    });
    load();
  };

  const updateSlackSetting = async (settings: {
    autoHuddleCapture?: boolean;
    slackApprovals?: boolean;
    slackLiveNotes?: boolean;
  }) => {
    await fetch("/api/integrations/slack/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    });
    load();
  };

  const gh = status.githubSettings ?? {};
  const slack = status.slackSettings ?? {};
  const slackCallbackUrl = `${status.appUrl}/api/integrations/slack/callback`;
  const slackEventsUrl = `${status.appUrl}/api/slack/events`;
  const slackInteractionsUrl = `${status.appUrl}/api/slack/interactions`;
  const githubCallbackUrl = `${status.appUrl}/api/integrations/github/callback`;
  const googleCallbackUrl = `${status.appUrl}/api/integrations/google/callback`;
  const googleLoginCallbackUrl = `${status.appUrl}/auth/callback`;

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-semibold mb-6">Connections</h1>

      {slackNotice === "connected" && (
        <p className="text-sm badge-success card p-3 mb-4">Slack connected successfully.</p>
      )}
      {slackNotice === "error" && (
        <p className="text-sm text-blaze-red card p-3 mb-4">
          Slack connection failed. Check your app credentials and redirect URL, then try again.
        </p>
      )}
      {slackNotice === "not_configured" && (
        <p className="text-sm text-blaze-red card p-3 mb-4">
          Slack isn&apos;t configured yet — add credentials to <code>.env</code> first (see below).
        </p>
      )}
      {githubNotice === "connected" && (
        <p className="text-sm badge-success card p-3 mb-4">GitHub connected successfully.</p>
      )}
      {githubNotice === "error" && (
        <p className="text-sm text-blaze-red card p-3 mb-4">
          GitHub connection failed. Check your OAuth app credentials and callback URL, then try again.
        </p>
      )}
      {githubNotice === "not_configured" && (
        <p className="text-sm text-blaze-red card p-3 mb-4">
          GitHub isn&apos;t configured yet — add <code>GITHUB_CLIENT_ID</code> and{" "}
          <code>GITHUB_CLIENT_SECRET</code> to <code>.env</code> first (see below).
        </p>
      )}
      {googleNotice === "connected" && (
        <p className="text-sm badge-success card p-3 mb-4">
          Google Calendar connected successfully.
        </p>
      )}
      {googleNotice === "error" && (
        <p className="text-sm text-blaze-red card p-3 mb-4">
          Google Calendar connection failed. Check your OAuth credentials and redirect
          URLs, then try again.
        </p>
      )}
      {googleNotice === "not_configured" && (
        <p className="text-sm text-blaze-red card p-3 mb-4">
          Google isn&apos;t configured yet — add <code>GOOGLE_CLIENT_ID</code> and{" "}
          <code>GOOGLE_CLIENT_SECRET</code> to <code>.env</code> first (see below).
        </p>
      )}

      <div className="space-y-4">
        <div className="card p-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-medium">Google Calendar</h2>
              <p className="text-sm text-muted mt-1">
                Auto-create calendar events from conversations
              </p>
            </div>
            <span
              className={`text-xs px-2 py-1 rounded-full ${
                status.google
                  ? "badge-flame"
                  : "badge-muted"
              }`}
            >
              {status.google ? "Connected" : "Not connected"}
            </span>
          </div>
          {!status.google ? (
            <div className="mt-4 space-y-3">
              {!status.googleConfigured ? (
                <div className="text-sm space-y-3 card p-4 bg-surface-muted/30">
                  <p className="font-medium">Set up Google Calendar (one-time)</p>
                  <ol className="list-decimal pl-5 space-y-2 text-muted">
                    <li>
                      Go to{" "}
                      <a
                        href="https://console.cloud.google.com/apis/credentials"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-link hover:underline"
                      >
                        Google Cloud Console → Credentials
                      </a>{" "}
                      → <strong>Create OAuth client ID</strong> (Web application)
                    </li>
                    <li>
                      Enable the <strong>Google Calendar API</strong> for your project
                    </li>
                    <li>
                      Add authorized redirect URIs:
                      <pre className="mt-2 p-2 rounded bg-surface text-xs overflow-x-auto">{`${googleLoginCallbackUrl}
${googleCallbackUrl}`}</pre>
                    </li>
                    <li>
                      Copy <strong>Client ID</strong> and <strong>Client secret</strong> into{" "}
                      <code>.env</code>:
                      <pre className="mt-2 p-2 rounded bg-surface text-xs overflow-x-auto">{`GOOGLE_CLIENT_ID="..."
GOOGLE_CLIENT_SECRET="..."`}</pre>
                    </li>
                    <li>
                      Restart <code>npm run dev:all</code>, then click Connect Google Calendar
                      below
                    </li>
                  </ol>
                </div>
              ) : (
                <a
                  href="/api/integrations/google"
                  className="inline-block px-4 py-2 text-sm btn-primary rounded-md"
                >
                  Connect Google Calendar
                </a>
              )}
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              <p className="text-xs text-muted">
                Blaze will create tentative calendar holds when it detects meetings in your
                notes and transcripts.
              </p>
              <a
                href="/api/integrations/google"
                className="inline-block text-sm text-link hover:underline"
              >
                Reconnect Google Calendar
              </a>
            </div>
          )}
        </div>

        <div className="card p-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-medium">Slack</h2>
              <p className="text-sm text-muted mt-1">
                Capture Slack meetings & huddles — live notes like Granola
              </p>
              {slack.teamName && (
                <p className="text-xs text-muted mt-1">{slack.teamName}</p>
              )}
            </div>
            <span
              className={`text-xs px-2 py-1 rounded-full ${
                status.slack
                  ? "badge-flame"
                  : "badge-muted"
              }`}
            >
              {status.slack ? "Connected" : "Not connected"}
            </span>
          </div>
          {!status.slack ? (
            <div className="mt-4 space-y-3">
              {!status.slackConfigured ? (
                <div className="text-sm space-y-3 card p-4 bg-surface-muted/30">
                  <p className="font-medium">Set up Slack (one-time)</p>
                  <ol className="list-decimal pl-5 space-y-2 text-muted">
                    <li>
                      Go to{" "}
                      <a
                        href="https://api.slack.com/apps"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-link hover:underline"
                      >
                        api.slack.com/apps
                      </a>{" "}
                      → <strong>Create New App</strong> → From scratch → name it Blaze
                    </li>
                    <li>
                      <strong>OAuth &amp; Permissions</strong> → Redirect URL:{" "}
                      <code className="text-xs break-all">{slackCallbackUrl}</code>
                    </li>
                    <li>
                      Add Bot Token Scopes:{" "}
                      <code className="text-xs">channels:history</code>,{" "}
                      <code className="text-xs">channels:read</code>,{" "}
                      <code className="text-xs">channels:join</code>,{" "}
                      <code className="text-xs">groups:history</code>,{" "}
                      <code className="text-xs">groups:read</code>,{" "}
                      <code className="text-xs">im:history</code>,{" "}
                      <code className="text-xs">im:read</code>,{" "}
                      <code className="text-xs">users:read</code>,{" "}
                      <code className="text-xs">chat:write</code>,{" "}
                      <code className="text-xs">canvases:write</code>
                    </li>
                    <li>
                      Copy <strong>Client ID</strong>, <strong>Client Secret</strong>, and{" "}
                      <strong>Signing Secret</strong> into <code>.env</code>:
                      <pre className="mt-2 p-2 rounded bg-surface text-xs overflow-x-auto">{`SLACK_CLIENT_ID="..."
SLACK_CLIENT_SECRET="..."
SLACK_SIGNING_SECRET="..."`}</pre>
                    </li>
                    <li>Restart <code>npm run dev</code>, then click Connect Slack below</li>
                    <li>
                      (Required for live capture) <strong>Event Subscriptions</strong> → Enable →
                      Request URL: <code className="text-xs break-all">{slackEventsUrl}</code>
                      — use ngrok for local dev
                    </li>
                    <li>
                      <strong>Interactivity</strong> → Enable → Request URL:{" "}
                      <code className="text-xs break-all">{slackInteractionsUrl}</code>
                    </li>
                  </ol>
                </div>
              ) : (
                <a
                  href="/api/integrations/slack"
                  className="inline-block px-4 py-2 text-sm btn-primary rounded-md"
                >
                  Connect Slack
                </a>
              )}
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              <label className="flex items-center justify-between text-sm">
                <span>Auto-capture Slack huddles</span>
                <input
                  type="checkbox"
                  checked={slack.autoHuddleCapture !== false}
                  onChange={(e) =>
                    updateSlackSetting({ autoHuddleCapture: e.target.checked })
                  }
                />
              </label>
              <label className="flex items-center justify-between text-sm">
                <span>Post live notes to Slack</span>
                <input
                  type="checkbox"
                  checked={slack.slackLiveNotes !== false}
                  onChange={(e) =>
                    updateSlackSetting({ slackLiveNotes: e.target.checked })
                  }
                />
              </label>
              <label className="flex items-center justify-between text-sm">
                <span>Approve agent actions in Slack</span>
                <input
                  type="checkbox"
                  checked={slack.slackApprovals !== false}
                  onChange={(e) =>
                    updateSlackSetting({ slackApprovals: e.target.checked })
                  }
                />
              </label>
              <p className="text-xs text-muted">
                When a huddle starts, Blaze opens a session, posts a live notes card
                in the huddle thread, and opens a <strong>canvas tab</strong> beside
                the meeting (canvas icon in the huddle bar). Type in the thread to
                feed notes — voice alone is not captured.
              </p>
              <div className="text-xs text-muted space-y-1 pt-2 border-t border-border-subtle">
                <p className="font-medium text-foreground">Slack app setup</p>
                <p>
                  Event subscription URL:{" "}
                  <code className="text-xs break-all">{slackEventsUrl}</code>
                </p>
                <p>
                  Interactivity URL:{" "}
                  <code className="text-xs break-all">{slackInteractionsUrl}</code>
                </p>
                <p>
                  Subscribe to: <code>message.channels</code>,{" "}
                  <code>message.groups</code>, <code>message.im</code>,{" "}
                  <code>user_huddle_changed</code>
                </p>
                <p className="text-muted">
                  Slack no longer lists <code>huddle_started</code> /{" "}
                  <code>huddle_ended</code> — <code>user_huddle_changed</code> is
                  the current event. Huddles are also detected via channel
                  messages automatically.
                </p>
                <p>
                  Invite the Blaze bot to channels you want to capture (or it will
                  auto-join public channels).
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="card p-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-medium">GitHub</h2>
              <p className="text-sm text-muted mt-1">
                Inbox for assignments, @mentions, and review requests
              </p>
              {status.githubLogin && (
                <p className="text-xs text-muted mt-1">@{status.githubLogin}</p>
              )}
            </div>
            <span
              className={`text-xs px-2 py-1 rounded-full ${
                status.github
                  ? "badge-flame"
                  : "badge-muted"
              }`}
            >
              {status.github ? "Connected" : "Not connected"}
            </span>
          </div>
          {!status.github ? (
            <div className="mt-4 space-y-3">
              {!status.githubConfigured ? (
                <div className="text-sm space-y-3 card p-4 bg-surface-muted/30">
                  <p className="font-medium">Set up GitHub OAuth (one-time)</p>
                  <ol className="list-decimal pl-5 space-y-2 text-muted">
                    <li>
                      Go to{" "}
                      <a
                        href="https://github.com/settings/developers"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-link hover:underline"
                      >
                        GitHub → Settings → Developer settings → OAuth Apps
                      </a>{" "}
                      → <strong>New OAuth App</strong>
                    </li>
                    <li>
                      <strong>Homepage URL:</strong>{" "}
                      <code className="text-xs">{status.appUrl}</code>
                    </li>
                    <li>
                      <strong>Authorization callback URL:</strong>{" "}
                      <code className="text-xs break-all">{githubCallbackUrl}</code>
                    </li>
                    <li>
                      Copy <strong>Client ID</strong> and generate a{" "}
                      <strong>Client secret</strong> into <code>.env</code>:
                      <pre className="mt-2 text-xs bg-surface p-2 rounded overflow-x-auto">{`GITHUB_CLIENT_ID="your-client-id"
GITHUB_CLIENT_SECRET="your-client-secret"`}</pre>
                    </li>
                    <li>
                      Restart <code>npm run dev:all</code>, then click Connect GitHub below.
                    </li>
                  </ol>
                </div>
              ) : null}
              <a
                href="/api/integrations/github"
                className={`inline-block px-4 py-2 text-sm rounded-md ${
                  status.githubConfigured ? "btn-primary" : "btn-secondary opacity-50 pointer-events-none"
                }`}
                aria-disabled={!status.githubConfigured}
              >
                Connect GitHub
              </a>
            </div>
          ) : (
            <div className="mt-4 space-y-2">
              <label className="flex items-center justify-between text-sm">
                <span>Auto-post ack on @mentions</span>
                <input
                  type="checkbox"
                  checked={gh.autoAckMention !== false}
                  onChange={(e) =>
                    updateGitHubSetting("autoAckMention", e.target.checked)
                  }
                />
              </label>
              <label className="flex items-center justify-between text-sm">
                <span>Auto-add assignments</span>
                <input
                  type="checkbox"
                  checked={gh.autoAssign !== false}
                  onChange={(e) =>
                    updateGitHubSetting("autoAssign", e.target.checked)
                  }
                />
              </label>
              <label className="flex items-center justify-between text-sm">
                <span>Auto-add @mentions</span>
                <input
                  type="checkbox"
                  checked={gh.autoMention !== false}
                  onChange={(e) =>
                    updateGitHubSetting("autoMention", e.target.checked)
                  }
                />
              </label>
              <label className="flex items-center justify-between text-sm">
                <span>Auto-add review requests</span>
                <input
                  type="checkbox"
                  checked={gh.autoReview !== false}
                  onChange={(e) =>
                    updateGitHubSetting("autoReview", e.target.checked)
                  }
                />
              </label>
              <p className="text-xs text-muted pt-2">
                Webhook URL (production):{" "}
                <code className="text-xs">
                  {typeof window !== "undefined"
                    ? `${window.location.origin}/api/github/webhook`
                    : "/api/github/webhook"}
                </code>
              </p>
              <p className="text-xs text-muted">
                Local dev: GitHub cannot reach localhost — use{" "}
                <strong>Inbox → Sync mentions</strong> instead, or expose the app
                with ngrok and add the webhook above.
              </p>
            </div>
          )}
        </div>

        <div className="card p-4">
          <h2 className="font-medium">Local repos (coding handoffs)</h2>
          <p className="text-sm text-muted mt-1">
            Map GitHub repos to local checkouts. Handoffs are written into{" "}
            <code className="text-xs">.blaze/handoffs/</code> inside that repo and Cursor opens
            the mapped workspace.
          </p>
          <RepoWorkspaceSettings />
        </div>

        <div className="card p-4">
          <ul className="text-sm space-y-2 mt-3">
            <li className="flex justify-between">
              <span>GitHub mention ack comments</span>
              <span className="text-primary">Auto</span>
            </li>
            <li className="flex justify-between">
              <span>GitHub next-step recommendations</span>
              <span className="text-accent">Confirm</span>
            </li>
            <li className="flex justify-between">
              <span>GitHub priority + notes</span>
              <span className="text-primary">Auto</span>
            </li>
            <li className="flex justify-between">
              <span>GitHub follow-up comments & labels</span>
              <span className="text-accent">Confirm</span>
            </li>
            <li className="flex justify-between">
              <span>Calendar events & todos</span>
              <span className="text-primary">Auto</span>
            </li>
            <li className="flex justify-between">
              <span>Emails & tickets</span>
              <span className="text-accent">Confirm</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
