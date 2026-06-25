import type { IntegrationStatusResponse, PluginStatusSlice } from "./types";

type LegacyStatus = Record<string, unknown>;

function legacyBool(status: IntegrationStatusResponse, key: string): boolean {
  return Boolean((status as LegacyStatus)[key]);
}

function legacyRecord(
  status: IntegrationStatusResponse,
  key: string
): Record<string, unknown> | null {
  const value = (status as LegacyStatus)[key];
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

/** Normalized per-plugin status from the API `plugins` map (with legacy fallbacks). */
export function pluginSlice(
  status: IntegrationStatusResponse,
  slug: string
): PluginStatusSlice {
  const fromMap = status.plugins?.[slug];
  if (fromMap) {
    return fromMap;
  }

  return {
    connected: legacyBool(status, slug),
    configured: legacyBool(status, `${slug}Configured`),
    metadata: legacyRecord(status, `${slug}Settings`),
  };
}

export function pluginConnected(status: IntegrationStatusResponse, slug: string): boolean {
  return pluginSlice(status, slug).connected;
}

export function pluginConfigured(status: IntegrationStatusResponse, slug: string): boolean {
  return pluginSlice(status, slug).configured;
}

/** User/integration metadata for connected-state UI (settings toggles, subtitles, etc.). */
export function pluginMetadata(
  status: IntegrationStatusResponse,
  slug: string
): Record<string, unknown> {
  const slice = pluginSlice(status, slug);
  if (slice.metadata) {
    return slice.metadata;
  }
  return legacyRecord(status, `${slug}Settings`) ?? {};
}

export const EMPTY_INTEGRATION_STATUS: IntegrationStatusResponse = {
  appUrl: "http://localhost:3010",
  plugins: {},
};
