import { contextBridge, ipcRenderer } from "electron";
import { IPC } from "./types";
import type { AiProvider, ApiSettings, Website } from "./types";

/**
 * Everything the renderer (React) is allowed to do lives here. We never
 * expose ipcRenderer directly — only these specific, typed functions —
 * so a compromised renderer can't invoke arbitrary IPC channels or touch
 * Node APIs. contextIsolation + sandbox in main.ts enforce the boundary.
 */
contextBridge.exposeInMainWorld("api", {
  settings: {
    getApiSettings: () => ipcRenderer.invoke(IPC.getApiSettings),
    setApiSettings: (settings: ApiSettings) => ipcRenderer.invoke(IPC.setApiSettings, settings),
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
    update: (id: string, patch: Partial<Website>) =>
      ipcRenderer.invoke(IPC.updateWebsite, { id, patch }),
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
