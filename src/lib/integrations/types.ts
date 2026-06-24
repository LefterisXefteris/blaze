import type { ReactNode } from "react";

export type PluginSlug = "google" | "slack" | "github";

export type PluginStatusSlice = {
  connected: boolean;
  configured: boolean;
  metadata?: Record<string, unknown> | null;
};

export type IntegrationStatusResponse = {
  appUrl: string;
  plugins?: Partial<Record<PluginSlug, PluginStatusSlice>>;
  // Legacy flat keys kept for backward compatibility
  google: boolean;
  googleConfigured: boolean;
  slack: boolean;
  slackConfigured: boolean;
  slackSettings: Record<string, unknown> | null;
  github: boolean;
  githubConfigured: boolean;
  githubLogin: string | null;
  githubSettings: Record<string, unknown> | null;
};

export type ConnectionNotice = "connected" | "error" | "not_configured" | null;

export type ConnectionPluginContext = {
  status: IntegrationStatusResponse;
  notice: ConnectionNotice;
  reload: () => void;
  updateSettings: (settings: Record<string, unknown>) => Promise<void>;
};

export interface ConnectionPlugin {
  slug: PluginSlug;
  title: string;
  description: string;
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
