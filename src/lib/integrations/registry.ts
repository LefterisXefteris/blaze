import { pluginConfigured, pluginConnected } from "./status";
import type { ConnectionPlugin } from "./types";

export class ConnectionRegistry {
  private static plugins: ConnectionPlugin[] = [];

  /**
   * Register a connection plugin. Import the plugin module from `index.ts` so it
   * self-registers on load. New plugins only need:
   *   1. `plugins/<slug>.tsx` implementing ConnectionPlugin
   *   2. One import line in `src/lib/integrations/index.ts`
   */
  static register(
    plugin: Omit<ConnectionPlugin, "isConnected" | "isConfigured"> &
      Partial<Pick<ConnectionPlugin, "isConnected" | "isConfigured">>
  ): ConnectionPlugin {
    const resolved: ConnectionPlugin = {
      isConnected: (status) => pluginConnected(status, plugin.slug),
      isConfigured: (status) => pluginConfigured(status, plugin.slug),
      ...plugin,
    };
    this.plugins.push(resolved);
    return resolved;
  }

  static all(): ConnectionPlugin[] {
    return [...this.plugins].sort(
      (a, b) => (a.order ?? 0) - (b.order ?? 0) || a.title.localeCompare(b.title)
    );
  }

  static get(slug: string): ConnectionPlugin | undefined {
    return this.plugins.find((p) => p.slug === slug);
  }
}
