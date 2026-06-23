"use client";

import { useEffect, useState } from "react";

type IntegrationStatus = {
  google: boolean;
  slack: boolean;
  slackConfigured: boolean;
  appUrl: string;
  github: boolean;
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

  const [status, setStatus] = useState<IntegrationStatus>({
    google: false,
    slack: false,
    slackConfigured: false,
    appUrl: "http://localhost:3001",
    github: false,
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
            <a
              href="/api/integrations/github"
              className="inline-block mt-3 px-4 py-2 text-sm btn-primary rounded-md"
            >
              Connect GitHub
            </a>
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
          <h2 className="font-medium">Agent autonomy</h2>
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
