import { ipcMain, BrowserWindow } from "electron";
import fs from "fs";
import path from "path";
import { getDb } from "../db/database";
import { getSecret, CREDENTIAL_KEYS } from "../services/credentials";
import { getContentDetail } from "../services/wordpress";
import {
  extractHeadings,
  stripHtmlToExcerpt,
  generateImagePlanOpenAI,
  generateImagePlanGemini
} from "../services/ai-planner";
import {
  processAndUploadImage,
  insertImageAndUpdateContent,
  skipImage,
  listGeneratedImagesForContent,
  regenerateImage
} from "../services/image-publish";
import {
  enqueueJobs,
  listJobs,
  retryJob,
  cancelJob,
  pauseQueue,
  resumeQueue,
  setJobUpdateListener
} from "../services/job-queue";
import { listBackupsForContent, rollbackToBackup } from "../services/backup";
import {
  listTemplates,
  addTemplate,
  updateTemplate,
  deleteTemplate,
  seedBuiltinTemplates
} from "../services/prompt-templates";
import { randomUUID } from "crypto";
import { IPC, type AiProvider, type GlobalSettings } from "../types";

function nowIso(): string {
  return new Date().toISOString();
}

export function registerContentAndPlannerHandlers(): void {
  ipcMain.handle(IPC.getContentDetail, async (_evt, args: { websiteId: string; contentId: number; contentType: "page" | "post" }) => {
    const db = getDb();
    const website = db.prepare(`SELECT * FROM websites WHERE id = ?`).get(args.websiteId) as any;
    if (!website) throw new Error("Website not found.");
    const appPassword = await getSecret(website.credential_key);
    if (!appPassword) throw new Error("Stored credentials missing for this site.");

    const detail = await getContentDetail(
      { siteUrl: website.site_url, username: website.username, applicationPassword: appPassword },
      args.contentId,
      args.contentType
    );
    return { ...detail, headings: extractHeadings(detail.rawContent) };
  });

  ipcMain.handle(
    IPC.generateImagePlan,
    async (
      _evt,
      args: {
        websiteId: string;
        contentId: number;
        contentType: "page" | "post";
        contentTitle: string;
        provider: AiProvider;
        imageCount: number;
        templateId?: string;
      }
    ) => {
      const db = getDb();
      const website = db.prepare(`SELECT * FROM websites WHERE id = ?`).get(args.websiteId) as any;
      if (!website) throw new Error("Website not found.");
      const appPassword = await getSecret(website.credential_key);
      if (!appPassword) throw new Error("Stored credentials missing for this site.");

      const detail = await getContentDetail(
        { siteUrl: website.site_url, username: website.username, applicationPassword: appPassword },
        args.contentId,
        args.contentType
      );

      let template: any = null;
      if (args.templateId) {
        template = db.prepare(`SELECT * FROM prompt_templates WHERE id = ?`).get(args.templateId);
      }

      const providerKeyAccount =
        args.provider === "openai" ? CREDENTIAL_KEYS.openaiApiKey : CREDENTIAL_KEYS.geminiApiKey;
      const apiKey = await getSecret(providerKeyAccount);
      if (!apiKey) throw new Error(`No API key saved for ${args.provider}.`);

      const settingsRow = db.prepare(`SELECT * FROM api_settings WHERE id = 1`).get() as any;

      const planInput = {
        pageTitle: detail.title || args.contentTitle,
        slug: detail.slug,
        headings: extractHeadings(detail.rawContent),
        contentExcerpt: stripHtmlToExcerpt(detail.rawContent),
        imageCount: args.imageCount,
        templateStyle: template?.image_style ?? "",
        templateAvoid: template?.things_to_avoid ?? "",
        brandNotes: website.brand_style_notes ?? ""
      };

      const plan =
        args.provider === "openai"
          ? await generateImagePlanOpenAI(apiKey, settingsRow.openai_model, planInput)
          : await generateImagePlanGemini(apiKey, planInput);

      const insert = db.prepare(
        `INSERT INTO generated_images
         (id, website_id, content_id, image_type, purpose, prompt, file_name, alt_text, caption, description, placement, target_size, status, created_at, updated_at)
         VALUES (@id, @websiteId, @contentId, @imageType, @purpose, @prompt, @fileName, @altText, @caption, '', @placement, @targetSize, 'planned', @now, @now)`
      );
      const now = nowIso();
      const insertMany = db.transaction((items: typeof plan) => {
        for (const item of items) {
          insert.run({
            id: randomUUID(),
            websiteId: args.websiteId,
            contentId: args.contentId,
            imageType: item.image_type,
            purpose: item.purpose,
            prompt: item.prompt,
            fileName: item.file_name,
            altText: item.alt_text,
            caption: item.caption,
            placement: item.placement,
            targetSize: item.size,
            now
          });
        }
      });
      insertMany(plan);

      return listGeneratedImagesForContent(args.websiteId, args.contentId);
    }
  );

  ipcMain.handle(IPC.listGeneratedImages, (_evt, args: { websiteId: string; contentId: number }) => {
    return listGeneratedImagesForContent(args.websiteId, args.contentId);
  });
}

export function registerImageHandlers(): void {
  ipcMain.handle(IPC.approveImage, async (_evt, args: { websiteId: string; imageId: string }) => {
    await processAndUploadImage(args.websiteId, args.imageId);
    return { ok: true };
  });

  ipcMain.handle(IPC.skipImage, (_evt, args: { imageId: string }) => {
    skipImage(args.imageId);
    return { ok: true };
  });

  ipcMain.handle(
    IPC.regenerateImage,
    async (_evt, args: { imageId: string; provider: AiProvider; newPrompt?: string }) => {
      const db = getDb();
      const providerKeyAccount =
        args.provider === "openai" ? CREDENTIAL_KEYS.openaiApiKey : CREDENTIAL_KEYS.geminiApiKey;
      const apiKey = await getSecret(providerKeyAccount);
      if (!apiKey) throw new Error(`No API key saved for ${args.provider}.`);
      const settingsRow = db.prepare(`SELECT * FROM api_settings WHERE id = 1`).get() as any;
      const model = args.provider === "openai" ? settingsRow.openai_model : settingsRow.gemini_model;
      await regenerateImage(args.imageId, args.provider, apiKey, model, args.newPrompt);
      return { ok: true };
    }
  );

  ipcMain.handle(
    IPC.uploadAndInsertImage,
    async (_evt, args: { websiteId: string; imageId: string; contentType: "page" | "post" }) => {
      const result = await insertImageAndUpdateContent(args.websiteId, args.imageId, args.contentType);
      return result;
    }
  );

  ipcMain.handle(IPC.readImageFile, (_evt, args: { filePath: string }) => {
    if (!fs.existsSync(args.filePath)) {
      throw new Error("Image file not found on disk.");
    }
    const buf = fs.readFileSync(args.filePath);
    const ext = path.extname(args.filePath).slice(1).toLowerCase();
    const mime = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
    return { dataUrl: `data:${mime};base64,${buf.toString("base64")}` };
  });
}

export function registerBackupHandlers(): void {
  ipcMain.handle(IPC.listBackups, (_evt, args: { websiteId: string; contentId: number }) => {
    return listBackupsForContent(args.websiteId, args.contentId);
  });

  ipcMain.handle(
    IPC.rollbackBackup,
    async (_evt, args: { websiteId: string; backupId: string; contentType: "page" | "post" }) => {
      const db = getDb();
      const website = db.prepare(`SELECT * FROM websites WHERE id = ?`).get(args.websiteId) as any;
      if (!website) throw new Error("Website not found.");
      const appPassword = await getSecret(website.credential_key);
      if (!appPassword) throw new Error("Stored credentials missing for this site.");

      await rollbackToBackup(
        { siteUrl: website.site_url, username: website.username, applicationPassword: appPassword },
        args.backupId,
        args.contentType
      );
      return { ok: true };
    }
  );
}

export function registerJobHandlers(mainWindow: BrowserWindow | null): void {
  setJobUpdateListener((job) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC.jobUpdated, job);
    }
  });

  ipcMain.handle(
    IPC.enqueueJobs,
    (
      _evt,
      args: {
        items: Array<{
          websiteId: string;
          contentId: number;
          contentType: "page" | "post";
          contentTitle: string;
          provider: AiProvider;
          imageCount: number;
          templateStyle: string;
          templateAvoid: string;
          brandNotes: string;
        }>;
      }
    ) => {
      return enqueueJobs(args.items);
    }
  );

  ipcMain.handle(IPC.listJobs, () => listJobs());
  ipcMain.handle(IPC.retryJob, (_evt, args: { jobId: string }) => {
    retryJob(args.jobId);
    return { ok: true };
  });
  ipcMain.handle(IPC.cancelJob, (_evt, args: { jobId: string }) => {
    cancelJob(args.jobId);
    return { ok: true };
  });
  ipcMain.handle(IPC.pauseQueue, () => {
    pauseQueue();
    return { ok: true };
  });
  ipcMain.handle(IPC.resumeQueue, () => {
    resumeQueue();
    return { ok: true };
  });
}

export function registerTemplateHandlers(): void {
  seedBuiltinTemplates();

  ipcMain.handle(IPC.listTemplates, () => listTemplates());
  ipcMain.handle(IPC.addTemplate, (_evt, args: any) => addTemplate(args));
  ipcMain.handle(IPC.updateTemplate, (_evt, args: { id: string; patch: any }) =>
    updateTemplate(args.id, args.patch)
  );
  ipcMain.handle(IPC.deleteTemplate, (_evt, args: { id: string }) => {
    deleteTemplate(args.id);
    return { ok: true };
  });
}

function rowToGlobalSettings(row: any): GlobalSettings {
  return {
    defaultImagesPerPage: row.default_images_per_page,
    defaultProvider: row.default_provider,
    defaultImageFormat: row.default_image_format,
    defaultCompressionQuality: row.default_compression_quality,
    autoApproveImages: Boolean(row.auto_approve_images),
    autoUploadAfterApproval: Boolean(row.auto_upload_after_approval),
    autoInsertAfterUpload: Boolean(row.auto_insert_after_upload),
    dryRunMode: Boolean(row.dry_run_mode),
    backupBeforeUpdate: Boolean(row.backup_before_update),
    watermarkDetectionEnabled: Boolean(row.watermark_detection_enabled),
    manualApprovalRequired: Boolean(row.manual_approval_required),
    activeTemplateId: row.active_template_id
  };
}

export function registerGlobalSettingsHandlers(): void {
  ipcMain.handle(IPC.getGlobalSettings, (): GlobalSettings => {
    const db = getDb();
    const row = db.prepare(`SELECT * FROM global_settings WHERE id = 1`).get();
    return rowToGlobalSettings(row);
  });

  ipcMain.handle(IPC.setGlobalSettings, (_evt, settings: GlobalSettings) => {
    const db = getDb();
    db.prepare(
      `UPDATE global_settings SET default_images_per_page = ?, default_provider = ?, default_image_format = ?,
       default_compression_quality = ?, auto_approve_images = ?, auto_upload_after_approval = ?,
       auto_insert_after_upload = ?, dry_run_mode = ?, backup_before_update = ?, watermark_detection_enabled = ?,
       manual_approval_required = ?, active_template_id = ? WHERE id = 1`
    ).run(
      settings.defaultImagesPerPage,
      settings.defaultProvider,
      settings.defaultImageFormat,
      settings.defaultCompressionQuality,
      settings.autoApproveImages ? 1 : 0,
      settings.autoUploadAfterApproval ? 1 : 0,
      settings.autoInsertAfterUpload ? 1 : 0,
      settings.dryRunMode ? 1 : 0,
      1, // backup_before_update is always enforced regardless of the UI toggle
      settings.watermarkDetectionEnabled ? 1 : 0,
      settings.manualApprovalRequired ? 1 : 0,
      settings.activeTemplateId
    );
    return { ok: true };
  });
}
