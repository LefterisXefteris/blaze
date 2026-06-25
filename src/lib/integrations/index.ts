import "./plugins/google";
import "./plugins/slack";
import "./plugins/github";

export { ConnectionRegistry } from "./registry";
export { EMPTY_INTEGRATION_STATUS, pluginConnected, pluginMetadata, pluginSlice } from "./status";
export type {
  ConnectionNotice,
  ConnectionPlugin,
  ConnectionPluginContext,
  IntegrationStatusResponse,
  PluginSlug,
  PluginStatusSlice,
} from "./types";
