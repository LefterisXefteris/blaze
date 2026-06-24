import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

type DesktopConfig = {
  apiUrl: string;
  appUrl: string;
  accessToken?: string | null;
  handoffDir?: string | null;
  repoWorkspaces?: Record<string, string>;
  cursorHandoff: string;
  cursorRules: boolean;
  pollIntervalSecs: number;
  deliveredActionIds: string[];
};

type ConnectionStatus = {
  apiReachable: boolean;
  authenticated: boolean;
  hasToken: boolean;
  message: string;
};

type PollResult = {
  delivered: Array<{
    actionId: string;
    title?: string;
    delivery: {
      path: string;
      filename: string;
      cursor: { opened?: boolean; method?: string };
    };
  }>;
  pendingCount: number;
  message: string;
  connection: ConnectionStatus;
};

const statusEl = document.querySelector("#status") as HTMLElement;
const deliveredListEl = document.querySelector("#delivered-list") as HTMLUListElement;
const connectionPillEl = document.querySelector("#connection-pill") as HTMLElement;
const connectionMessageEl = document.querySelector("#connection-message") as HTMLElement;

function setStatus(text: string, kind: "ok" | "error" | "idle" = "idle") {
  statusEl.textContent = text;
  statusEl.dataset.kind = kind;
}

function renderConnection(status: ConnectionStatus) {
  connectionMessageEl.textContent = status.message;

  if (status.authenticated) {
    connectionPillEl.textContent = "Connected";
    connectionPillEl.className = "pill ok";
    return;
  }

  if (status.apiReachable && status.hasToken) {
    connectionPillEl.textContent = "Session expired";
    connectionPillEl.className = "pill warn";
    return;
  }

  if (status.apiReachable) {
    connectionPillEl.textContent = "Not logged in";
    connectionPillEl.className = "pill warn";
    return;
  }

  connectionPillEl.textContent = "API offline";
  connectionPillEl.className = "pill error";
}

function renderDelivered(result: PollResult) {
  deliveredListEl.innerHTML = "";
  renderConnection(result.connection);
  for (const item of result.delivered) {
    const li = document.createElement("li");
    li.innerHTML = `<strong>${item.title ?? item.actionId}</strong><br /><code>${item.delivery.path}</code>`;
    deliveredListEl.appendChild(li);
  }
}

async function refreshConnection() {
  try {
    const status = await invoke<ConnectionStatus>("check_desktop_connection");
    renderConnection(status);
  } catch (error) {
    connectionPillEl.textContent = "Error";
    connectionPillEl.className = "pill error";
    connectionMessageEl.textContent = String(error);
  }
}

async function loadConfig() {
  const config = await invoke<DesktopConfig>("get_config");
  (document.querySelector("#app-url") as HTMLInputElement).value = config.appUrl;
  (document.querySelector("#api-url") as HTMLInputElement).value = config.apiUrl;
  (document.querySelector("#access-token") as HTMLInputElement).value =
    config.accessToken ?? "";
  (document.querySelector("#handoff-dir") as HTMLInputElement).value =
    config.handoffDir ?? "";
  (document.querySelector("#repo-workspaces") as HTMLTextAreaElement).value =
    JSON.stringify(config.repoWorkspaces ?? {}, null, 2);
  (document.querySelector("#cursor-rules") as HTMLInputElement).checked =
    config.cursorRules;
  (document.querySelector("#poll-interval") as HTMLInputElement).value = String(
    config.pollIntervalSecs
  );
}

async function saveSettings(event: Event) {
  event.preventDefault();
  let repoWorkspaces: Record<string, string> = {};
  const rawRepos = (
    document.querySelector("#repo-workspaces") as HTMLTextAreaElement
  ).value.trim();
  if (rawRepos) {
    try {
      repoWorkspaces = JSON.parse(rawRepos) as Record<string, string>;
    } catch {
      setStatus("Repo workspaces must be valid JSON", "error");
      return;
    }
  }

  const config: DesktopConfig = {
    apiUrl: (document.querySelector("#api-url") as HTMLInputElement).value.trim(),
    appUrl: (document.querySelector("#app-url") as HTMLInputElement).value.trim(),
    accessToken:
      (document.querySelector("#access-token") as HTMLInputElement).value.trim() ||
      null,
    handoffDir:
      (document.querySelector("#handoff-dir") as HTMLInputElement).value.trim() ||
      null,
    repoWorkspaces,
    cursorHandoff: "auto",
    cursorRules: (document.querySelector("#cursor-rules") as HTMLInputElement).checked,
    pollIntervalSecs: Number(
      (document.querySelector("#poll-interval") as HTMLInputElement).value
    ),
    deliveredActionIds: (await invoke<DesktopConfig>("get_config")).deliveredActionIds,
  };

  await invoke("save_desktop_config", { config });
  setStatus("Settings saved", "ok");
  await refreshConnection();
}

async function openBlaze() {
  try {
    await invoke("open_blaze_app");
    setStatus("Notepad opened", "ok");
    window.setTimeout(() => void refreshConnection(), 1200);
  } catch (error) {
    setStatus(String(error), "error");
  }
}

async function syncAuth() {
  setStatus("Syncing session from notepad…");
  try {
    const status = await invoke<ConnectionStatus>("sync_auth_from_blaze");
    renderConnection(status);
    await loadConfig();
    setStatus(status.message, status.authenticated ? "ok" : "idle");
  } catch (error) {
    setStatus(String(error), "error");
  }
}

async function pollNow() {
  setStatus("Checking for handoffs…");
  try {
    const result = await invoke<PollResult>("poll_handoffs");
    renderDelivered(result);
    setStatus(result.message, result.delivered.length > 0 ? "ok" : "idle");
  } catch (error) {
    setStatus(String(error), "error");
    await refreshConnection();
  }
}

window.addEventListener("DOMContentLoaded", () => {
  void loadConfig();
  void refreshConnection();

  document.querySelector("#open-blaze")?.addEventListener("click", () => void openBlaze());
  document.querySelector("#poll-now")?.addEventListener("click", () => void pollNow());
  document.querySelector("#sync-auth")?.addEventListener("click", () => void syncAuth());
  document
    .querySelector("#settings-form")
    ?.addEventListener("submit", (e) => void saveSettings(e));

  window.setInterval(() => void refreshConnection(), 30_000);

  void listen<PollResult>("handoff-poll", (event) => {
    renderDelivered(event.payload);
    setStatus(event.payload.message, event.payload.delivered.length > 0 ? "ok" : "idle");
  });

  void listen<string>("handoff-error", (event) => {
    setStatus(event.payload, "error");
    void refreshConnection();
  });

  void listen("connection-updated", () => {
    void loadConfig();
    void refreshConnection();
  });
});
