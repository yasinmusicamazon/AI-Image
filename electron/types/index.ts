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
  | "before_final_cta"
  | "manual_only";

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

export type ImageType =
  | "featured_image"
  | "hero_image"
  | "section_image"
  | "cta_image"
  | "infographic";

export type ImageStatus =
  | "planned"
  | "generating"
  | "generated"
  | "watermark_flagged"
  | "approved"
  | "skipped"
  | "processed"
  | "uploaded"
  | "inserted"
  | "failed";

export interface GeneratedImage {
  id: string;
  websiteId: string;
  contentId: number;
  imageType: ImageType;
  purpose: string;
  prompt: string;
  fileName: string;
  altText: string;
  caption: string;
  description: string;
  placement: InsertionRule;
  targetSize: string;
  provider: AiProvider | null;
  status: ImageStatus;
  localPath: string | null;
  processedPath: string | null;
  originalFileSize: number | null;
  processedFileSize: number | null;
  watermarkFlag: boolean;
  watermarkReason: string | null;
  wpMediaId: number | null;
  wpMediaUrl: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export type JobStatus =
  | "pending"
  | "analyzing"
  | "generating"
  | "processing"
  | "uploading"
  | "updating"
  | "completed"
  | "failed"
  | "skipped"
  | "canceled";

export interface JobLogEntry {
  timestamp: string;
  message: string;
}

export interface Job {
  id: string;
  websiteId: string;
  contentId: number;
  contentTitle: string;
  provider: AiProvider | "manual";
  status: JobStatus;
  progress: number;
  logs: JobLogEntry[];
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ContentBackup {
  id: string;
  websiteId: string;
  contentId: number;
  originalContentRaw: string;
  originalFeaturedMedia: number | null;
  createdAt: string;
  restoredAt: string | null;
}

export interface PromptTemplate {
  id: string;
  name: string;
  imageStyle: string;
  thingsToAvoid: string;
  altTextRules: string;
  filenameRules: string;
  promptFormat: string;
  defaultImageCount: number;
  isBuiltin: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface GlobalSettings {
  defaultImagesPerPage: number;
  defaultProvider: AiProvider | "manual";
  defaultImageFormat: "webp" | "jpg" | "png";
  defaultCompressionQuality: number;
  autoApproveImages: boolean;
  autoUploadAfterApproval: boolean;
  autoInsertAfterUpload: boolean;
  dryRunMode: boolean;
  backupBeforeUpdate: boolean;
  watermarkDetectionEnabled: boolean;
  manualApprovalRequired: boolean;
  activeTemplateId: string | null;
}

export interface WpContentDetail extends WpContentItem {
  rawContent: string;
  headings: string[];
}

export interface MediaUploadResult {
  id: number;
  sourceUrl: string;
}
// NOTE: preload.ts intentionally duplicates these as inline string literals
// (see comment there) since sandboxed preload scripts cannot import local
// files. Keep both lists in sync when adding a channel.
export const IPC = {
  // API settings / keys
  getApiSettings: "settings:getApi",
  setApiSettings: "settings:setApi",
  saveApiKey: "settings:saveApiKey",
  getApiKeyStatus: "settings:getApiKeyStatus",
  testApiKey: "settings:testApiKey",

  // Global settings
  getGlobalSettings: "settings:getGlobal",
  setGlobalSettings: "settings:setGlobal",

  // Websites
  listWebsites: "websites:list",
  addWebsite: "websites:add",
  updateWebsite: "websites:update",
  deleteWebsite: "websites:delete",
  testWebsiteConnection: "websites:testConnection",
  loadWebsiteContent: "websites:loadContent",

  // Content
  listContent: "content:list",
  getContentDetail: "content:getDetail",

  // AI Image Planner
  generateImagePlan: "planner:generate",
  listGeneratedImages: "images:listForContent",

  // Image generation / review
  generateImage: "images:generate",
  approveImage: "images:approve",
  skipImage: "images:skip",
  regenerateImage: "images:regenerate",

  // Upload / insert
  uploadAndInsertImage: "images:uploadAndInsert",
  readImageFile: "images:readFile",

  // Backup / rollback
  listBackups: "backups:list",
  rollbackBackup: "backups:rollback",

  // Job queue
  enqueueJobs: "jobs:enqueue",
  listJobs: "jobs:list",
  retryJob: "jobs:retry",
  cancelJob: "jobs:cancel",
  pauseQueue: "jobs:pauseQueue",
  resumeQueue: "jobs:resumeQueue",
  jobUpdated: "jobs:updated", // main -> renderer push event

  // Prompt templates
  listTemplates: "templates:list",
  addTemplate: "templates:add",
  updateTemplate: "templates:update",
  deleteTemplate: "templates:delete",

  // Dashboard
  getDashboardSummary: "dashboard:getSummary"
} as const;
