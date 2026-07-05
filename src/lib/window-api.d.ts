import type {
  AiProvider,
  ApiSettings,
  Website,
  WpContentItem,
  WpContentDetail,
  GeneratedImage,
  Job,
  ContentBackup,
  PromptTemplate,
  GlobalSettings
} from "../../electron/types";

export interface ApiKeyTestResult {
  success: boolean;
  message: string;
}

export interface ApiKeyStatus {
  provider: AiProvider;
  configured: boolean;
  lastTestedAt: string | null;
  lastTestResult: "success" | "error" | null;
  lastTestMessage: string | null;
}

export interface DashboardSummary {
  totalWebsites: number;
  totalContentLoaded: number;
  pendingJobs: number;
  completedJobs: number;
  failedJobs: number;
  openaiStatus: ApiKeyStatus;
  geminiStatus: ApiKeyStatus;
}

export interface WordPressConnectionTestResult {
  ok: boolean;
  steps: {
    restApiReachable: boolean;
    authenticationValid: boolean;
    canReadContent: boolean;
    canUploadMedia: boolean;
    canUpdateContent: boolean;
  };
  errors: string[];
  siteInfo?: { name: string; wpVersion?: string };
}

declare global {
  interface Window {
    api: {
      settings: {
        getApiSettings: () => Promise<ApiSettings>;
        setApiSettings: (settings: ApiSettings) => Promise<{ ok: true }>;
        saveApiKey: (provider: AiProvider, apiKey: string) => Promise<{ ok: true }>;
        getApiKeyStatus: () => Promise<{ openai: ApiKeyStatus; gemini: ApiKeyStatus }>;
        testApiKey: (provider: AiProvider) => Promise<ApiKeyTestResult>;
        getGlobalSettings: () => Promise<GlobalSettings>;
        setGlobalSettings: (settings: GlobalSettings) => Promise<{ ok: true }>;
      };
      websites: {
        list: () => Promise<Website[]>;
        add: (payload: {
          name: string;
          siteUrl: string;
          username: string;
          applicationPassword: string;
        }) => Promise<Website>;
        update: (id: string, patch: Partial<Website>) => Promise<Website>;
        delete: (id: string) => Promise<{ ok: true }>;
        testConnection: (id: string) => Promise<WordPressConnectionTestResult>;
        loadContent: (id: string) => Promise<{ count: number }>;
      };
      content: {
        list: (websiteId: string) => Promise<WpContentItem[]>;
        getDetail: (
          websiteId: string,
          contentId: number,
          contentType: "page" | "post"
        ) => Promise<WpContentDetail>;
      };
      planner: {
        generate: (args: {
          websiteId: string;
          contentId: number;
          contentType: "page" | "post";
          contentTitle: string;
          provider: AiProvider;
          imageCount: number;
          templateId?: string;
        }) => Promise<GeneratedImage[]>;
        listImages: (websiteId: string, contentId: number) => Promise<GeneratedImage[]>;
      };
      images: {
        approve: (websiteId: string, imageId: string) => Promise<{ ok: true }>;
        skip: (imageId: string) => Promise<{ ok: true }>;
        regenerate: (imageId: string, provider: AiProvider, newPrompt?: string) => Promise<{ ok: true }>;
        uploadAndInsert: (
          websiteId: string,
          imageId: string,
          contentType: "page" | "post"
        ) => Promise<{ inserted: boolean; note: string }>;
        readImageFile: (filePath: string) => Promise<{ dataUrl: string }>;
      };
      backups: {
        list: (websiteId: string, contentId: number) => Promise<ContentBackup[]>;
        rollback: (
          websiteId: string,
          backupId: string,
          contentType: "page" | "post"
        ) => Promise<{ ok: true }>;
      };
      jobs: {
        enqueue: (items: unknown[]) => Promise<Job[]>;
        list: () => Promise<Job[]>;
        retry: (jobId: string) => Promise<{ ok: true }>;
        cancel: (jobId: string) => Promise<{ ok: true }>;
        pauseQueue: () => Promise<{ ok: true }>;
        resumeQueue: () => Promise<{ ok: true }>;
        onUpdate: (callback: (job: Job) => void) => () => void;
      };
      templates: {
        list: () => Promise<PromptTemplate[]>;
        add: (template: Partial<PromptTemplate>) => Promise<PromptTemplate>;
        update: (id: string, patch: Partial<PromptTemplate>) => Promise<PromptTemplate>;
        delete: (id: string) => Promise<{ ok: true }>;
      };
      dashboard: {
        getSummary: () => Promise<DashboardSummary>;
      };
    };
  }
}

export {};
