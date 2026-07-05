import type { AiProvider, ApiSettings, Website } from "../../electron/types";

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
        list: (websiteId: string) => Promise<any[]>;
      };
      dashboard: {
        getSummary: () => Promise<DashboardSummary>;
      };
    };
  }
}

export {};
