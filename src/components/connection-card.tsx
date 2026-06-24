import type { ConnectionNotice, ConnectionPlugin, ConnectionPluginContext } from "@/lib/integrations/types";

type ConnectionCardProps = {
  plugin: ConnectionPlugin;
  ctx: ConnectionPluginContext;
};

export function ConnectionCard({ plugin, ctx }: ConnectionCardProps) {
  const connected = plugin.isConnected(ctx.status);
  const configured = plugin.isConfigured(ctx.status);
  const subtitle = plugin.subtitle?.(ctx.status);

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-medium">{plugin.title}</h2>
          <p className="text-sm text-muted mt-1">{plugin.description}</p>
          {subtitle && <p className="text-xs text-muted mt-1">{subtitle}</p>}
        </div>
        <span
          className={`text-xs px-2 py-1 rounded-full ${
            connected ? "badge-flame" : "badge-muted"
          }`}
        >
          {connected ? "Connected" : "Not connected"}
        </span>
      </div>

      {!connected ? (
        <div className="mt-4 space-y-3">
          {!configured && plugin.renderSetup(ctx)}
          <a
            href={`/api/integrations/${plugin.slug}`}
            className={`inline-block px-4 py-2 text-sm rounded-md ${
              configured ? "btn-primary" : "btn-secondary opacity-50 pointer-events-none"
            }`}
            aria-disabled={!configured}
          >
            Connect {plugin.title}
          </a>
        </div>
      ) : (
        <div className="mt-4">{plugin.renderConnected(ctx)}</div>
      )}
    </div>
  );
}

export function ConnectionNoticeBanner({
  plugin,
  notice,
}: {
  plugin: ConnectionPlugin;
  notice: ConnectionNotice;
}) {
  if (!notice) return null;

  const copy = plugin.notices[notice];
  if (!copy) return null;

  if (notice === "connected" && "success" in copy) {
    return <p className="text-sm badge-success card p-3 mb-4">{copy.success}</p>;
  }

  if ("error" in copy) {
    return <p className="text-sm text-blaze-red card p-3 mb-4">{copy.error}</p>;
  }

  return null;
}
