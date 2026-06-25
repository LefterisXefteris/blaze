import type { ReactNode } from "react";

export type PluginSlug = string;

export type PluginStatusSlice = {
  connected: boolean;
  configured: boolean;
  metadata?: Record<string, unknown> | null;
};

export type IntegrationStatusResponse = {
  appUrl: string;
  plugins: Record<string, PluginStatusSlice>;
  elevenlabsConfigured?: boolean;
  // Legacy flat keys — populated by older API clients; prefer `plugins[slug]`.
  google?: boolean;
  googleConfigured?: boolean;
  slack?: boolean;
  slackConfigured?: boolean;
  slackSettings?: Record<string, unknown> | null;
  github?: boolean;
  githubConfigured?: boolean;
  githubLogin?: string | null;
  githubSettings?: Record<string, unknown> | null;
};

export type ConnectionNotice = "connected" | "error" | "not_configured" | null;

export type ConnectionPluginContext = {
  status: IntegrationStatusResponse;
  notice: ConnectionNotice;
  reload: () => void;
  updateSettings: (settings: Record<string, unknown>) => Promise<void>;
};

export interface ConnectionPlugin {
  slug: string;
  title: string;
  description: string;
  /** Lower numbers appear first on the Connections page (default 0). */
  order?: number;
  subtitle?: (status: IntegrationStatusResponse) => string | null;
  isConnected: (status: IntegrationStatusResponse) => boolean;
  isConfigured: (status: IntegrationStatusResponse) => boolean;
  notices: {
    connected?: { success: string };
    error?: { error: string };
    not_configured?: { error: string };
  };
  renderSetup: (ctx: ConnectionPluginContext) => ReactNode;
  renderConnected: (ctx: ConnectionPluginContext) => ReactNode;
}
