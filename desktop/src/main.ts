import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

type DesktopConfig = {
  apiUrl: string;
  appUrl: string;
  accessToken?: string | null;
  handoffDir?: string | null;
  cursorHandoff: string;
  cursorRules: boolean;
  pollIntervalSecs: number;
  deliveredActionIds: string[];
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
};

const statusEl = document.querySelector("#status") as HTMLElement;
const deliveredListEl = document.querySelector("#delivered-list") as HTMLUListElement;

function setStatus(text: string, kind: "ok" | "error" | "idle" = "idle") {
  statusEl.textContent = text;
  statusEl.dataset.kind = kind;
}

function renderDelivered(result: PollResult) {
  deliveredListEl.innerHTML = "";
  for (const item of result.delivered) {
    const li = document.createElement("li");
    li.innerHTML = `<strong>${item.title ?? item.actionId}</strong><br /><code>${item.delivery.path}</code>`;
    deliveredListEl.appendChild(li);
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
  (document.querySelector("#cursor-rules") as HTMLInputElement).checked =
    config.cursorRules;
  (document.querySelector("#poll-interval") as HTMLInputElement).value = String(
    config.pollIntervalSecs
  );
}

async function saveSettings(event: Event) {
  event.preventDefault();
  const config: DesktopConfig = {
    apiUrl: (document.querySelector("#api-url") as HTMLInputElement).value.trim(),
    appUrl: (document.querySelector("#app-url") as HTMLInputElement).value.trim(),
    accessToken:
      (document.querySelector("#access-token") as HTMLInputElement).value.trim() ||
      null,
    handoffDir:
      (document.querySelector("#handoff-dir") as HTMLInputElement).value.trim() ||
      null,
    cursorHandoff: "auto",
    cursorRules: (document.querySelector("#cursor-rules") as HTMLInputElement).checked,
    pollIntervalSecs: Number(
      (document.querySelector("#poll-interval") as HTMLInputElement).value
    ),
    deliveredActionIds: (await invoke<DesktopConfig>("get_config")).deliveredActionIds,
  };

  await invoke("save_desktop_config", { config });
  setStatus("Settings saved", "ok");
}

async function openBlaze() {
  try {
    await invoke("open_blaze_app");
    setStatus("Blaze window opened", "ok");
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
  }
}

window.addEventListener("DOMContentLoaded", () => {
  void loadConfig();

  document.querySelector("#open-blaze")?.addEventListener("click", () => void openBlaze());
  document.querySelector("#poll-now")?.addEventListener("click", () => void pollNow());
  document
    .querySelector("#settings-form")
    ?.addEventListener("submit", (e) => void saveSettings(e));

  void listen<PollResult>("handoff-poll", (event) => {
    renderDelivered(event.payload);
    setStatus(event.payload.message, event.payload.delivered.length > 0 ? "ok" : "idle");
  });

  void listen<string>("handoff-error", (event) => {
    setStatus(event.payload, "error");
  });
});
