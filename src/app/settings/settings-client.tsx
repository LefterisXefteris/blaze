"use client";

import { useEffect, useState } from "react";
import { ConnectionCard, ConnectionNoticeBanner } from "@/components/connection-card";
import {
  ConnectionRegistry,
  EMPTY_INTEGRATION_STATUS,
  type ConnectionNotice,
  type IntegrationStatusResponse,
} from "@/lib/integrations";

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

function parseNotice(value: string | null): ConnectionNotice {
  if (value === "connected" || value === "error" || value === "not_configured") {
    return value;
  }
  return null;
}

export default function SettingsPage() {
  const [status, setStatus] = useState<IntegrationStatusResponse>(EMPTY_INTEGRATION_STATUS);
  const [notices, setNotices] = useState<Record<string, ConnectionNotice>>({});

  const load = () => {
    fetch("/api/integrations/status")
      .then((r) => r.json())
      .then(setStatus);
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const next: Record<string, ConnectionNotice> = {};
    for (const plugin of ConnectionRegistry.all()) {
      next[plugin.slug] = parseNotice(params.get(plugin.slug));
    }
    setNotices(next);
  }, []);

  useEffect(() => {
    load();
  }, []);

  const updatePluginSettings = async (slug: string, settings: Record<string, unknown>) => {
    await fetch(`/api/integrations/${slug}/settings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    });
    load();
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-semibold mb-6">Connections</h1>

      {ConnectionRegistry.all().map((plugin) => (
        <ConnectionNoticeBanner
          key={`notice-${plugin.slug}`}
          plugin={plugin}
          notice={notices[plugin.slug] ?? null}
        />
      ))}

      <div className="space-y-4">
        {ConnectionRegistry.all().map((plugin) => (
          <ConnectionCard
            key={plugin.slug}
            plugin={plugin}
            ctx={{
              status,
              notice: notices[plugin.slug] ?? null,
              reload: load,
              updateSettings: (settings) => updatePluginSettings(plugin.slug, settings),
            }}
          />
        ))}

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
