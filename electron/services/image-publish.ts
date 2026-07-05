import { getDb } from "../db/database";
import { getSecret } from "./credentials";
import { processImage, sizeForImageType, parseSizeString } from "./image-processing";
import { uploadMedia, buildImageMarkup, insertImageIntoContent, updateContent, getContentDetail } from "./wordpress";
import { createBackup } from "./backup";
import path from "path";

function nowIso(): string {
  return new Date().toISOString();
}

async function getWebsiteCreds(websiteId: string) {
  const db = getDb();
  const row = db.prepare(`SELECT * FROM websites WHERE id = ?`).get(websiteId) as any;
  if (!row) throw new Error("Website not found.");
  const appPassword = await getSecret(row.credential_key);
  if (!appPassword) throw new Error("Stored WordPress credentials missing for this site.");
  return {
    row,
    creds: { siteUrl: row.site_url, username: row.username, applicationPassword: appPassword }
  };
}

/**
 * Processes (resize/compress/convert/rename) and uploads a generated image
 * to the WordPress Media Library. Does not touch page/post content — that
 * is a separate, explicit step (insertImageAndUpdateContent) so uploading
 * to the media library and publishing into a page are distinct, reversible
 * actions.
 */
export async function processAndUploadImage(websiteId: string, imageId: string): Promise<void> {
  const db = getDb();
  const img = db.prepare(`SELECT * FROM generated_images WHERE id = ?`).get(imageId) as any;
  if (!img) throw new Error("Image not found.");
  if (!img.local_path) throw new Error("Image has not been generated yet.");

  const { row: websiteRow, creds } = await getWebsiteCreds(websiteId);

  const fallbackSize = sizeForImageType(img.image_type);
  const { width, height } = parseSizeString(img.target_size, fallbackSize);

  const processed = await processImage({
    inputPath: img.local_path,
    outputDir: path.join(path.dirname(img.local_path), "processed"),
    desiredFileName: img.file_name,
    targetWidth: width,
    targetHeight: height,
    format: websiteRow.default_image_format,
    quality: websiteRow.default_compression_quality,
    maxFileSizeBytes: null
  });

  db.prepare(
    `UPDATE generated_images SET status = 'processed', processed_path = ?, processed_file_size = ?, updated_at = ? WHERE id = ?`
  ).run(processed.outputPath, processed.processedSizeBytes, nowIso(), imageId);

  const mimeType =
    websiteRow.default_image_format === "webp"
      ? "image/webp"
      : websiteRow.default_image_format === "jpg"
      ? "image/jpeg"
      : "image/png";

  const uploadResult = await uploadMedia(creds, processed.outputPath, processed.fileName, mimeType, {
    title: img.file_name.replace(/\.[a-zA-Z0-9]+$/, ""),
    altText: img.alt_text,
    caption: img.caption,
    description: img.description
  });

  db.prepare(
    `UPDATE generated_images SET status = 'uploaded', wp_media_id = ?, wp_media_url = ?, updated_at = ? WHERE id = ?`
  ).run(uploadResult.id, uploadResult.sourceUrl, nowIso(), imageId);
}

/**
 * Inserts an already-uploaded image into its page/post content (or sets it
 * as the featured image), always creating a backup of the current content
 * first. Skips insertion if the image URL is already present (dedup).
 */
export async function insertImageAndUpdateContent(
  websiteId: string,
  imageId: string,
  contentType: "page" | "post"
): Promise<{ inserted: boolean; note: string }> {
  const db = getDb();
  const img = db.prepare(`SELECT * FROM generated_images WHERE id = ?`).get(imageId) as any;
  if (!img) throw new Error("Image not found.");
  if (!img.wp_media_id || !img.wp_media_url) {
    throw new Error("Image has not been uploaded to WordPress Media yet.");
  }

  const globalSettings = db.prepare(`SELECT * FROM global_settings WHERE id = 1`).get() as any;
  if (globalSettings.dry_run_mode) {
    return {
      inserted: false,
      note: "Dry-run mode is enabled in Global Settings — the image was generated and uploaded, but no changes were made to live page/post content. Turn off dry-run mode to publish for real."
    };
  }

  const { creds } = await getWebsiteCreds(websiteId);

  // Always backup before any content-modifying call.
  await createBackup(creds, websiteId, img.content_id, contentType);

  if (img.placement === "featured_image") {
    await updateContent(creds, img.content_id, contentType, { featuredMedia: img.wp_media_id });
    db.prepare(`UPDATE generated_images SET status = 'inserted', updated_at = ? WHERE id = ?`).run(nowIso(), imageId);
    return { inserted: true, note: "Set as featured image." };
  }

  if (img.placement === "manual_only") {
    db.prepare(`UPDATE generated_images SET status = 'uploaded', updated_at = ? WHERE id = ?`).run(nowIso(), imageId);
    return { inserted: false, note: "Placement is manual-only; image is uploaded but not auto-inserted. Add it in the WordPress editor." };
  }

  const detail = await getContentDetail(creds, img.content_id, contentType);
  const markup = buildImageMarkup(img.wp_media_id, img.wp_media_url, img.alt_text, img.caption, true);
  const result = insertImageIntoContent(detail.rawContent, markup, img.wp_media_url, img.placement);

  if (result.inserted) {
    await updateContent(creds, img.content_id, contentType, { content: result.updatedContent });
    db.prepare(`UPDATE generated_images SET status = 'inserted', updated_at = ? WHERE id = ?`).run(nowIso(), imageId);
  }

  return { inserted: result.inserted, note: result.note };
}

export function skipImage(imageId: string): void {
  const db = getDb();
  db.prepare(`UPDATE generated_images SET status = 'skipped', updated_at = ? WHERE id = ?`).run(nowIso(), imageId);
}

export function listGeneratedImagesForContent(websiteId: string, contentId: number) {
  const db = getDb();
  const rows = db
    .prepare(`SELECT * FROM generated_images WHERE website_id = ? AND content_id = ? ORDER BY created_at ASC`)
    .all(websiteId, contentId) as any[];

  return rows.map((row) => ({
    id: row.id,
    websiteId: row.website_id,
    contentId: row.content_id,
    imageType: row.image_type,
    purpose: row.purpose,
    prompt: row.prompt,
    fileName: row.file_name,
    altText: row.alt_text,
    caption: row.caption,
    description: row.description,
    placement: row.placement,
    targetSize: row.target_size,
    provider: row.provider,
    status: row.status,
    localPath: row.local_path,
    processedPath: row.processed_path,
    originalFileSize: row.original_file_size,
    processedFileSize: row.processed_file_size,
    watermarkFlag: Boolean(row.watermark_flag),
    watermarkReason: row.watermark_reason,
    wpMediaId: row.wp_media_id,
    wpMediaUrl: row.wp_media_url,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }));
}

/** Regenerates a single image (new AI call with the same or an edited prompt). */
export async function regenerateImage(
  imageId: string,
  provider: "openai" | "gemini",
  apiKey: string,
  model: string,
  newPrompt?: string
): Promise<void> {
  const db = getDb();
  const img = db.prepare(`SELECT * FROM generated_images WHERE id = ?`).get(imageId) as any;
  if (!img) throw new Error("Image not found.");

  const prompt = newPrompt ?? img.prompt;
  const outputDir = path.dirname(img.local_path ?? path.join(process.cwd(), "tmp"));
  const fileBase = img.file_name.replace(/\.[a-zA-Z0-9]+$/, "") + "-regen-" + Date.now();

  db.prepare(`UPDATE generated_images SET status = 'generating', prompt = ?, updated_at = ? WHERE id = ?`).run(
    prompt,
    nowIso(),
    imageId
  );

  const { generateImageOpenAI, generateImageGemini } = await import("./image-generation");
  const result =
    provider === "openai"
      ? await generateImageOpenAI(apiKey, model, prompt, outputDir, fileBase)
      : await generateImageGemini(apiKey, model, prompt, outputDir, fileBase);

  db.prepare(
    `UPDATE generated_images SET status = 'generated', provider = ?, local_path = ?, original_file_size = ?, watermark_flag = 0, watermark_reason = NULL, updated_at = ? WHERE id = ?`
  ).run(provider, result.localPath, result.fileSizeBytes, nowIso(), imageId);
}
