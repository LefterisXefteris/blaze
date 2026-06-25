"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { pluginConnected } from "@/lib/integrations";

type Mode = "slack" | "manual" | "github";

function parseMode(value?: string): Mode {
  if (value === "slack" || value === "github" || value === "manual") {
    return value;
  }
  return "slack";
}

export function NewSessionForm({ initialMode }: { initialMode?: string }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [transcript, setTranscript] = useState("");
  const [githubUrl, setGithubUrl] = useState("");
  const [mode, setMode] = useState<Mode>(parseMode(initialMode));
  const [channels, setChannels] = useState<
    Array<{ id: string; name: string; type: string }>
  >([]);
  const [selectedChannel, setSelectedChannel] = useState("");
  const [slackConnected, setSlackConnected] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadChannels = async () => {
    const res = await fetch("/api/slack/channels");
    if (res.status === 401 || res.status === 503) {
      setSlackConnected(false);
      return;
    }
    if (res.ok) {
      setSlackConnected(true);
      setChannels(await res.json());
    }
  };

  useEffect(() => {
    if (mode === "slack") loadChannels();
  }, [mode]);

  useEffect(() => {
    fetch("/api/integrations/status")
      .then((r) => r.json())
      .then((data) => setSlackConnected(pluginConnected(data, "slack")));
  }, []);

  const createSession = async () => {
    setLoading(true);
    setError(null);
    try {
      let res;

      if (mode === "slack") {
        res = await fetch("/api/slack/channels", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ channelId: selectedChannel, title }),
        });
      } else if (mode === "github") {
        res = await fetch("/api/github/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: githubUrl }),
        });
      } else {
        res = await fetch("/api/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, transcript: transcript || undefined }),
        });
      }

      if (res.ok) {
        const data = await res.json();
        const sessionId = data.session?.id ?? data.id;
        router.push(`/sessions/${sessionId}`);
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Could not start capture");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <Link href="/notes" className="text-sm text-muted hover:text-foreground">
        ← Back
      </Link>
      <h1 className="text-2xl font-semibold mt-4 mb-2">Capture a meeting</h1>
      <p className="text-sm text-muted mb-6 prose-muted">
        Like Granola — Blaze listens to your Slack channel or huddle, writes live
        notes, and saves a structured summary when you&apos;re done.
      </p>

      <div className="flex gap-2 mb-6 flex-wrap">
        {(
          [
            ["slack", "Slack"],
            ["manual", "Manual"],
            ["github", "GitHub"],
          ] as const
        ).map(([m, label]) => (
          <button
            key={m}
            onClick={() => {
              setMode(m);
              if (m === "slack") loadChannels();
            }}
            className={`px-3 py-1.5 text-sm rounded-md ${
              mode === m ? "btn-primary" : "btn-secondary"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="space-y-4">
        {mode === "slack" && (
          <>
            {slackConnected === false && (
              <div className="card p-4 text-sm">
                <p className="font-medium">Connect Slack first</p>
                <p className="text-muted mt-1">
                  Blaze needs Slack access to capture channel messages and huddles.
                </p>
                <Link
                  href="/settings"
                  className="inline-block mt-3 text-sm text-link hover:underline"
                >
                  Go to Connections → Connect Slack
                </Link>
              </div>
            )}
            <div>
              <label className="text-sm font-medium">Slack channel or DM</label>
              <select
                value={selectedChannel}
                onChange={(e) => setSelectedChannel(e.target.value)}
                className="w-full mt-1 px-3 py-2 text-sm border border-border rounded-md bg-surface"
              >
                <option value="">Select where the meeting happens…</option>
                {channels.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.type === "im" ? "DM" : "#"} {c.name}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted mt-2">
                Start a huddle or post in this channel — Blaze captures messages in
                real time. Huddles auto-start when Event Subscriptions are set up
                in Connections.
              </p>
            </div>
            <div>
              <label className="text-sm font-medium">Meeting title (optional)</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Product sync"
                className="w-full mt-1 px-3 py-2 text-sm border border-border rounded-md bg-surface"
              />
            </div>
          </>
        )}

        {mode !== "github" && mode !== "slack" && (
          <div>
            <label className="text-sm font-medium">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Product sync with Alex"
              className="w-full mt-1 px-3 py-2 text-sm border border-border rounded-md bg-surface"
            />
          </div>
        )}

        {mode === "github" && (
          <div>
            <label className="text-sm font-medium">GitHub issue or PR URL</label>
            <input
              value={githubUrl}
              onChange={(e) => setGithubUrl(e.target.value)}
              placeholder="https://github.com/owner/repo/issues/42"
              className="w-full mt-1 px-3 py-2 text-sm border border-border rounded-md bg-surface"
            />
            <p className="text-xs text-muted mt-1">
              Imports thread, adds to priority list, and drafts agent actions.
            </p>
          </div>
        )}

        {mode === "manual" && (
          <div>
            <label className="text-sm font-medium">Initial transcript (optional)</label>
            <textarea
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              placeholder={"Alex: Let's sync Tuesday at 3pm\nYou: I'll send the deck by Friday"}
              rows={8}
              className="w-full mt-1 px-3 py-2 text-sm border border-border rounded-md bg-surface font-mono"
            />
          </div>
        )}

        {error && <p className="text-sm text-blaze-red">{error}</p>}

        <button
          onClick={createSession}
          disabled={
            loading ||
            (mode === "slack" && (!selectedChannel || slackConnected === false)) ||
            (mode === "github" && !githubUrl.trim())
          }
          className="px-4 py-2.5 btn-primary rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50"
        >
          {loading
            ? "Starting…"
            : mode === "slack"
              ? "Start capturing"
              : mode === "github"
                ? "Import from GitHub"
                : "Start session"}
        </button>
      </div>
    </div>
  );
}
