import { contextBridge, ipcRenderer } from "electron";

// IMPORTANT: this file must have ZERO local `import`/`require` statements
// (only the built-in "electron" module is allowed). Electron's sandboxed
// preload environment (sandbox: true, set in main.ts) only permits
// requiring a small allowlist of Electron/Node built-ins — requiring any
// local relative file (e.g. "./types") throws immediately and silently
// kills the entire preload script before contextBridge ever runs, which
// is why window.api would otherwise be undefined in every screen.
//
// These channel names are intentionally duplicated from
// electron/types/index.ts rather than imported — keep them in sync if
// you add a new IPC channel there.
const IPC = {
  getApiSettings: "settings:getApi",
  setApiSettings: "settings:setApi",
  saveApiKey: "settings:saveApiKey",
  getApiKeyStatus: "settings:getApiKeyStatus",
  testApiKey: "settings:testApiKey",

  listWebsites: "websites:list",
  addWebsite: "websites:add",
  updateWebsite: "websites:update",
  deleteWebsite: "websites:delete",
  testWebsiteConnection: "websites:testConnection",
  loadWebsiteContent: "websites:loadContent",

  listContent: "content:list",

  getDashboardSummary: "dashboard:getSummary"
} as const;

type AiProvider = "openai" | "gemini";

/**
 * Everything the renderer (React) is allowed to do lives here. We never
 * expose ipcRenderer directly — only these specific, typed functions —
 * so a compromised renderer can't invoke arbitrary IPC channels or touch
 * Node APIs. contextIsolation + sandbox in main.ts enforce the boundary.
 */
contextBridge.exposeInMainWorld("api", {
  settings: {
    getApiSettings: () => ipcRenderer.invoke(IPC.getApiSettings),
    setApiSettings: (settings: unknown) => ipcRenderer.invoke(IPC.setApiSettings, settings),
    saveApiKey: (provider: AiProvider, apiKey: string) =>
      ipcRenderer.invoke(IPC.saveApiKey, { provider, apiKey }),
    getApiKeyStatus: () => ipcRenderer.invoke(IPC.getApiKeyStatus),
    testApiKey: (provider: AiProvider) => ipcRenderer.invoke(IPC.testApiKey, { provider })
  },
  websites: {
    list: () => ipcRenderer.invoke(IPC.listWebsites),
    add: (payload: {
      name: string;
      siteUrl: string;
      username: string;
      applicationPassword: string;
    }) => ipcRenderer.invoke(IPC.addWebsite, payload),
    update: (id: string, patch: unknown) => ipcRenderer.invoke(IPC.updateWebsite, { id, patch }),
    delete: (id: string) => ipcRenderer.invoke(IPC.deleteWebsite, { id }),
    testConnection: (id: string) => ipcRenderer.invoke(IPC.testWebsiteConnection, { id }),
    loadContent: (id: string) => ipcRenderer.invoke(IPC.loadWebsiteContent, { id })
  },
  content: {
    list: (websiteId: string) => ipcRenderer.invoke(IPC.listContent, { websiteId })
  },
  dashboard: {
    getSummary: () => ipcRenderer.invoke(IPC.getDashboardSummary)
  }
});

