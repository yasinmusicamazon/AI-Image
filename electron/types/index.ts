// Shared types for WP AI Image Publisher.
// Kept dependency-free so this file can be imported from both the
// Electron main process (CommonJS build) and the Vite/React renderer.

export type AiProvider = "openai" | "gemini";

export interface ApiKeyStatus {
  provider: AiProvider;
  configured: boolean;
  lastTestedAt: string | null;
  lastTestResult: "success" | "error" | null;
  lastTestMessage: string | null;
}

export interface ApiSettings {
  defaultProvider: AiProvider | "manual";
  openaiModel: string;
  geminiModel: string;
  requestTimeoutMs: number;
  maxRetries: number;
  rateLimitPerMinute: number;
}

export interface Website {
  id: string;
  name: string;
  siteUrl: string;
  username: string;
  // NOTE: the application password itself is never stored in this object
  // once it reaches the renderer. It lives only in the OS keychain,
  // referenced by `credentialKey`. See electron/services/credentials.ts.
  credentialKey: string;
  defaultImageSizes: {
    featured: string;
    hero: string;
    section: string;
    inline: string;
    ctaBackground: string;
    blogCard: string;
  };
  defaultImageFormat: "webp" | "jpg" | "png";
  defaultCompressionQuality: number; // 1-100
  defaultInsertionRule: InsertionRule;
  excludedSlugs: string[];
  brandStyleNotes: string;
  createdAt: string;
  updatedAt: string;
  connectionStatus: ConnectionStatus;
  lastCheckedAt: string | null;
}

export type ConnectionStatus =
  | "untested"
  | "checking"
  | "connected"
  | "error";

export type InsertionRule =
  | "featured_image"
  | "after_first_h2"
  | "after_second_h2"
  | "before_faq"
  | "before_final_cta";

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
  siteInfo?: {
    name: string;
    wpVersion?: string;
  };
}

export interface WpContentItem {
  id: number;
  websiteId: string;
  type: "page" | "post";
  title: string;
  slug: string;
  url: string;
  status: string;
  modifiedAt: string;
  featuredImageId: number | null;
  existingImageCount: number | null;
  categories: string[];
  tags: string[];
  seoTitle: string | null;
  seoMeta: string | null;
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

// IPC channel names, centralized to avoid typos between main/preload/renderer.
export const IPC = {
  // API settings / keys
  getApiSettings: "settings:getApi",
  setApiSettings: "settings:setApi",
  saveApiKey: "settings:saveApiKey",
  getApiKeyStatus: "settings:getApiKeyStatus",
  testApiKey: "settings:testApiKey",

  // Websites
  listWebsites: "websites:list",
  addWebsite: "websites:add",
  updateWebsite: "websites:update",
  deleteWebsite: "websites:delete",
  testWebsiteConnection: "websites:testConnection",
  loadWebsiteContent: "websites:loadContent",

  // Content
  listContent: "content:list",

  // Dashboard
  getDashboardSummary: "dashboard:getSummary"
} as const;
