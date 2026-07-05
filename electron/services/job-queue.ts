import { randomUUID } from "crypto";
import path from "path";
import { app } from "electron";
import { getDb } from "../db/database";
import { getSecret, CREDENTIAL_KEYS } from "./credentials";
import { getContentDetail } from "./wordpress";
import {
  extractHeadings,
  stripHtmlToExcerpt,
  generateImagePlanOpenAI,
  generateImagePlanGemini,
  type ImagePlanItem
} from "./ai-planner";
import { generateImageOpenAI, generateImageGemini } from "./image-generation";
import { checkWatermarkOpenAI, checkWatermarkGemini } from "./watermark-detection";
import { processAndUploadImage, insertImageAndUpdateContent } from "./image-publish";
import type { AiProvider, Job, JobLogEntry, JobStatus } from "../types";

interface EnqueueItem {
  websiteId: string;
  contentId: number;
  contentType: "page" | "post";
  contentTitle: string;
  provider: AiProvider;
  imageCount: number;
  templateStyle: string;
  templateAvoid: string;
  brandNotes: string;
}

interface WpCredsLite {
  siteUrl: string;
  username: string;
  applicationPassword: string;
}

let isPaused = false;
let isRunning = false;
let onJobUpdate: ((job: Job) => void) | null = null;

export function setJobUpdateListener(fn: (job: Job) => void): void {
  onJobUpdate = fn;
}

function nowIso(): string {
  return new Date().toISOString();
}

function rowToJob(row: any): Job {
  return {
    id: row.id,
    websiteId: row.website_id,
    contentId: row.content_id,
    contentTitle: row.content_title,
    provider: row.provider,
    status: row.status,
    progress: row.progress,
    logs: JSON.parse(row.logs_json),
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function updateJob(
  jobId: string,
  patch: { status?: JobStatus; progress?: number; errorMessage?: string | null; appendLog?: string }
): Job {
  const db = getDb();
  const existing = db.prepare(`SELECT * FROM jobs WHERE id = ?`).get(jobId) as any;
  if (!existing) throw new Error("Job not found.");

  const logs: JobLogEntry[] = JSON.parse(existing.logs_json);
  if (patch.appendLog) {
    logs.push({ timestamp: nowIso(), message: patch.appendLog });
  }

  const status = patch.status ?? existing.status;
  const progress = patch.progress ?? existing.progress;
  const errorMessage = patch.errorMessage !== undefined ? patch.errorMessage : existing.error_message;

  db.prepare(
    `UPDATE jobs SET status = ?, progress = ?, logs_json = ?, error_message = ?, updated_at = ? WHERE id = ?`
  ).run(status, progress, JSON.stringify(logs), errorMessage, nowIso(), jobId);

  const updated = rowToJob(db.prepare(`SELECT * FROM jobs WHERE id = ?`).get(jobId));
  if (onJobUpdate) onJobUpdate(updated);
  return updated;
}

export function listJobs(): Job[] {
  const db = getDb();
  const rows = db.prepare(`SELECT * FROM jobs ORDER BY created_at DESC LIMIT 200`).all();
  return rows.map(rowToJob);
}

export function enqueueJobs(items: EnqueueItem[]): Job[] {
  const db = getDb();
  const now = nowIso();
  const insert = db.prepare(
    `INSERT INTO jobs (id, website_id, content_id, content_title, provider, status, progress, logs_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'pending', 0, '[]', ?, ?)`
  );

  const created: Job[] = [];
  const insertMany = db.transaction((rows: EnqueueItem[]) => {
    for (const item of rows) {
      const id = randomUUID();
      insert.run(id, item.websiteId, item.contentId, item.contentTitle, item.provider, now, now);
      created.push(rowToJob(db.prepare(`SELECT * FROM jobs WHERE id = ?`).get(id)));
    }
  });
  insertMany(items);

  // Stash the per-item planning context (image count, template) in module
  // memory keyed by job id, since the jobs table itself only stores
  // execution state, not full request parameters.
  items.forEach((item, i) => {
    jobContext.set(created[i].id, item);
  });

  runQueueLoop();
  return created;
}

// Job id -> original enqueue parameters (image count / template text),
// kept in memory only. If the app restarts mid-queue, pending jobs will
// need re-enqueueing rather than resuming with the same plan parameters —
// acceptable for a first job-queue implementation, and made visible to
// the user via job logs rather than failing silently.
const jobContext = new Map<string, EnqueueItem>();

export function pauseQueue(): void {
  isPaused = true;
}

export function resumeQueue(): void {
  isPaused = false;
  runQueueLoop();
}

export function isQueuePaused(): boolean {
  return isPaused;
}

export function retryJob(jobId: string): void {
  const db = getDb();
  const row = db.prepare(`SELECT * FROM jobs WHERE id = ?`).get(jobId) as any;
  if (!row) throw new Error("Job not found.");
  updateJob(jobId, { status: "pending", errorMessage: null, appendLog: "Retrying job." });
  runQueueLoop();
}

export function cancelJob(jobId: string): void {
  const db = getDb();
  const row = db.prepare(`SELECT * FROM jobs WHERE id = ?`).get(jobId) as any;
  if (!row) throw new Error("Job not found.");
  if (row.status === "pending") {
    updateJob(jobId, { status: "canceled", appendLog: "Canceled before starting." });
  } else {
    // Best-effort: mark canceled; the queue loop checks this before each
    // major stage and will stop advancing the job further.
    updateJob(jobId, { status: "canceled", appendLog: "Cancel requested; stopping at next safe checkpoint." });
  }
}

async function runQueueLoop(): Promise<void> {
  if (isRunning || isPaused) return;
  isRunning = true;

  try {
    const db = getDb();
    // eslint-disable-next-line no-constant-condition
    while (true) {
      if (isPaused) break;
      const nextRow = db
        .prepare(`SELECT * FROM jobs WHERE status = 'pending' ORDER BY created_at ASC LIMIT 1`)
        .get() as any;
      if (!nextRow) break;

      await processJob(rowToJob(nextRow));
    }
  } finally {
    isRunning = false;
  }
}

async function processJob(job: Job): Promise<void> {
  const context = jobContext.get(job.id);
  if (!context) {
    updateJob(job.id, {
      status: "failed",
      errorMessage: "Job context was lost (likely due to an app restart mid-queue). Please re-create this job from Content Manager.",
      appendLog: "Failed: missing job context."
    });
    return;
  }

  const db = getDb();
  const websiteRow = db.prepare(`SELECT * FROM websites WHERE id = ?`).get(job.websiteId) as any;
  if (!websiteRow) {
    updateJob(job.id, { status: "failed", errorMessage: "Website no longer exists.", appendLog: "Failed: website not found." });
    return;
  }

  const appPassword = await getSecret(websiteRow.credential_key);
  if (!appPassword) {
    updateJob(job.id, { status: "failed", errorMessage: "Stored WordPress credentials missing.", appendLog: "Failed: credentials missing." });
    return;
  }

  const creds: WpCredsLite = {
    siteUrl: websiteRow.site_url,
    username: websiteRow.username,
    applicationPassword: appPassword
  };

  const providerKeyAccount =
    context.provider === "openai" ? CREDENTIAL_KEYS.openaiApiKey : CREDENTIAL_KEYS.geminiApiKey;
  const providerApiKey = await getSecret(providerKeyAccount);
  if (!providerApiKey) {
    updateJob(job.id, {
      status: "failed",
      errorMessage: `No API key saved for ${context.provider}.`,
      appendLog: `Failed: missing ${context.provider} API key.`
    });
    return;
  }

  try {
    // ---- Stage: analyzing ----
    updateJob(job.id, { status: "analyzing", progress: 10, appendLog: "Fetching content and building image plan..." });
    const detail = await getContentDetail(creds, job.contentId, context.contentType);
    const headings = extractHeadings(detail.rawContent);
    const excerpt = stripHtmlToExcerpt(detail.rawContent);

    const planInput = {
      pageTitle: detail.title || job.contentTitle,
      slug: detail.slug,
      headings,
      contentExcerpt: excerpt,
      imageCount: context.imageCount,
      templateStyle: context.templateStyle,
      templateAvoid: context.templateAvoid,
      brandNotes: context.brandNotes
    };

    let plan: ImagePlanItem[];
    if (context.provider === "openai") {
      const settingsRow = db.prepare(`SELECT * FROM api_settings WHERE id = 1`).get() as any;
      plan = await generateImagePlanOpenAI(providerApiKey, settingsRow.openai_model, planInput);
    } else {
      plan = await generateImagePlanGemini(providerApiKey, planInput);
    }

    updateJob(job.id, { progress: 30, appendLog: `Plan generated: ${plan.length} image(s) recommended.` });

    const insertPlanned = db.prepare(
      `INSERT INTO generated_images
       (id, website_id, content_id, image_type, purpose, prompt, file_name, alt_text, caption, description, placement, target_size, status, created_at, updated_at)
       VALUES (@id, @websiteId, @contentId, @imageType, @purpose, @prompt, @fileName, @altText, @caption, '', @placement, @targetSize, 'planned', @now, @now)`
    );
    const now = nowIso();
    const plannedIds: string[] = [];
    for (const item of plan) {
      const id = randomUUID();
      plannedIds.push(id);
      insertPlanned.run({
        id,
        websiteId: job.websiteId,
        contentId: job.contentId,
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

    // ---- Stage: generating (+ watermark check) ----
    updateJob(job.id, { status: "generating", progress: 40, appendLog: "Generating images..." });
    const outputDir = path.join(app.getPath("userData"), "generated-images", job.websiteId);

    let completedCount = 0;
    for (const imageId of plannedIds) {
      // Check for cancellation between images.
      const currentJob = rowToJob(db.prepare(`SELECT * FROM jobs WHERE id = ?`).get(job.id));
      if (currentJob.status === "canceled") return;

      const imgRow = db.prepare(`SELECT * FROM generated_images WHERE id = ?`).get(imageId) as any;
      try {
        db.prepare(`UPDATE generated_images SET status = 'generating', updated_at = ? WHERE id = ?`).run(nowIso(), imageId);

        const settingsRow = db.prepare(`SELECT * FROM api_settings WHERE id = 1`).get() as any;
        const fileBase = imgRow.file_name.replace(/\.[a-zA-Z0-9]+$/, "") || `image-${imageId.slice(0, 8)}`;

        const genResult =
          context.provider === "openai"
            ? await generateImageOpenAI(providerApiKey, settingsRow.openai_model, imgRow.prompt, outputDir, fileBase)
            : await generateImageGemini(providerApiKey, settingsRow.gemini_model, imgRow.prompt, outputDir, fileBase);

        db.prepare(
          `UPDATE generated_images SET status = 'generated', provider = ?, local_path = ?, original_file_size = ?, updated_at = ? WHERE id = ?`
        ).run(context.provider, genResult.localPath, genResult.fileSizeBytes, nowIso(), imageId);

        updateJob(job.id, { appendLog: `Generated image "${imgRow.file_name}".` });

        // Watermark check (uses the same provider's vision capability).
        const globalSettingsRow = db.prepare(`SELECT * FROM global_settings WHERE id = 1`).get() as any;
        let watermarked = false;
        if (globalSettingsRow.watermark_detection_enabled) {
          const check =
            context.provider === "openai"
              ? await checkWatermarkOpenAI(providerApiKey, genResult.localPath)
              : await checkWatermarkGemini(providerApiKey, genResult.localPath);

          if (check.watermarkDetected) {
            watermarked = true;
            db.prepare(
              `UPDATE generated_images SET status = 'watermark_flagged', watermark_flag = 1, watermark_reason = ?, updated_at = ? WHERE id = ?`
            ).run(check.reason, nowIso(), imageId);
            updateJob(job.id, { appendLog: `Watermark flagged on "${imgRow.file_name}": ${check.reason}` });
          }
        }

        // Auto-pipeline: only proceeds past generation if the image is
        // clean AND the relevant global automation toggles are on. Each
        // stage is still gated independently, matching the three separate
        // settings (auto-approve / auto-upload / auto-insert) rather than
        // treating them as one combined switch.
        if (!watermarked && globalSettingsRow.auto_approve_images && globalSettingsRow.auto_upload_after_approval) {
          try {
            await processAndUploadImage(job.websiteId, imageId);
            updateJob(job.id, { appendLog: `Auto-processed and uploaded "${imgRow.file_name}" to WordPress Media.` });

            if (globalSettingsRow.auto_insert_after_upload) {
              const insertResult = await insertImageAndUpdateContent(job.websiteId, imageId, context.contentType);
              updateJob(job.id, { appendLog: `Auto-insert: ${insertResult.note}` });
            }
          } catch (autoErr) {
            updateJob(job.id, {
              appendLog: `Auto-pipeline stopped for "${imgRow.file_name}": ${(autoErr as Error).message}`
            });
          }
        }

        completedCount += 1;
        updateJob(job.id, { progress: 40 + Math.round((completedCount / plannedIds.length) * 40) });
      } catch (err) {
        db.prepare(`UPDATE generated_images SET status = 'failed', error_message = ?, updated_at = ? WHERE id = ?`).run(
          (err as Error).message,
          nowIso(),
          imageId
        );
        updateJob(job.id, { appendLog: `Failed to generate "${imgRow.file_name}": ${(err as Error).message}` });
      }
    }

    updateJob(job.id, {
      status: "completed",
      progress: 100,
      appendLog: "Images ready for review in Image Review."
    });
  } catch (err) {
    updateJob(job.id, {
      status: "failed",
      errorMessage: (err as Error).message,
      appendLog: `Failed: ${(err as Error).message}`
    });
  }
}
