import type { ConnectionPlugin } from "./types";

export class ConnectionRegistry {
  private static plugins: ConnectionPlugin[] = [];

  static register(plugin: ConnectionPlugin): ConnectionPlugin {
    this.plugins.push(plugin);
    return plugin;
  }

  static all(): ConnectionPlugin[] {
    return this.plugins;
  }

  static get(slug: string): ConnectionPlugin | undefined {
    return this.plugins.find((p) => p.slug === slug);
  }
}
