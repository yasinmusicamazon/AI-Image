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

  getGlobalSettings: "settings:getGlobal",
  setGlobalSettings: "settings:setGlobal",

  listWebsites: "websites:list",
  addWebsite: "websites:add",
  updateWebsite: "websites:update",
  deleteWebsite: "websites:delete",
  testWebsiteConnection: "websites:testConnection",
  loadWebsiteContent: "websites:loadContent",

  listContent: "content:list",
  getContentDetail: "content:getDetail",

  generateImagePlan: "planner:generate",
  listGeneratedImages: "images:listForContent",

  generateImage: "images:generate",
  approveImage: "images:approve",
  skipImage: "images:skip",
  regenerateImage: "images:regenerate",

  uploadAndInsertImage: "images:uploadAndInsert",
  readImageFile: "images:readFile",

  listBackups: "backups:list",
  rollbackBackup: "backups:rollback",

  enqueueJobs: "jobs:enqueue",
  listJobs: "jobs:list",
  retryJob: "jobs:retry",
  cancelJob: "jobs:cancel",
  pauseQueue: "jobs:pauseQueue",
  resumeQueue: "jobs:resumeQueue",
  jobUpdated: "jobs:updated",

  listTemplates: "templates:list",
  addTemplate: "templates:add",
  updateTemplate: "templates:update",
  deleteTemplate: "templates:delete",

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
    testApiKey: (provider: AiProvider) => ipcRenderer.invoke(IPC.testApiKey, { provider }),
    getGlobalSettings: () => ipcRenderer.invoke(IPC.getGlobalSettings),
    setGlobalSettings: (settings: unknown) => ipcRenderer.invoke(IPC.setGlobalSettings, settings)
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
    list: (websiteId: string) => ipcRenderer.invoke(IPC.listContent, { websiteId }),
    getDetail: (websiteId: string, contentId: number, contentType: "page" | "post") =>
      ipcRenderer.invoke(IPC.getContentDetail, { websiteId, contentId, contentType })
  },
  planner: {
    generate: (args: {
      websiteId: string;
      contentId: number;
      contentType: "page" | "post";
      contentTitle: string;
      provider: AiProvider;
      imageCount: number;
      templateId?: string;
    }) => ipcRenderer.invoke(IPC.generateImagePlan, args),
    listImages: (websiteId: string, contentId: number) =>
      ipcRenderer.invoke(IPC.listGeneratedImages, { websiteId, contentId })
  },
  images: {
    approve: (websiteId: string, imageId: string) =>
      ipcRenderer.invoke(IPC.approveImage, { websiteId, imageId }),
    skip: (imageId: string) => ipcRenderer.invoke(IPC.skipImage, { imageId }),
    regenerate: (imageId: string, provider: AiProvider, newPrompt?: string) =>
      ipcRenderer.invoke(IPC.regenerateImage, { imageId, provider, newPrompt }),
    uploadAndInsert: (websiteId: string, imageId: string, contentType: "page" | "post") =>
      ipcRenderer.invoke(IPC.uploadAndInsertImage, { websiteId, imageId, contentType }),
    readImageFile: (filePath: string) => ipcRenderer.invoke(IPC.readImageFile, { filePath })
  },
  backups: {
    list: (websiteId: string, contentId: number) =>
      ipcRenderer.invoke(IPC.listBackups, { websiteId, contentId }),
    rollback: (websiteId: string, backupId: string, contentType: "page" | "post") =>
      ipcRenderer.invoke(IPC.rollbackBackup, { websiteId, backupId, contentType })
  },
  jobs: {
    enqueue: (items: unknown[]) => ipcRenderer.invoke(IPC.enqueueJobs, { items }),
    list: () => ipcRenderer.invoke(IPC.listJobs),
    retry: (jobId: string) => ipcRenderer.invoke(IPC.retryJob, { jobId }),
    cancel: (jobId: string) => ipcRenderer.invoke(IPC.cancelJob, { jobId }),
    pauseQueue: () => ipcRenderer.invoke(IPC.pauseQueue),
    resumeQueue: () => ipcRenderer.invoke(IPC.resumeQueue),
    onUpdate: (callback: (job: unknown) => void) => {
      const listener = (_event: unknown, job: unknown) => callback(job);
      ipcRenderer.on(IPC.jobUpdated, listener);
      return () => ipcRenderer.removeListener(IPC.jobUpdated, listener);
    }
  },
  templates: {
    list: () => ipcRenderer.invoke(IPC.listTemplates),
    add: (template: unknown) => ipcRenderer.invoke(IPC.addTemplate, template),
    update: (id: string, patch: unknown) => ipcRenderer.invoke(IPC.updateTemplate, { id, patch }),
    delete: (id: string) => ipcRenderer.invoke(IPC.deleteTemplate, { id })
  },
  dashboard: {
    getSummary: () => ipcRenderer.invoke(IPC.getDashboardSummary)
  }
});

