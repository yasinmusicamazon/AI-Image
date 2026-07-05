import sharp from "sharp";
import fs from "fs";
import path from "path";

export interface ProcessImageOptions {
  inputPath: string;
  outputDir: string;
  desiredFileName: string; // may or may not have extension; extension is derived from format
  targetWidth: number;
  targetHeight: number;
  format: "webp" | "jpg" | "png";
  quality: number; // 1-100
  maxFileSizeBytes?: number | null;
}

export interface ProcessImageResult {
  outputPath: string;
  fileName: string;
  originalSizeBytes: number;
  processedSizeBytes: number;
}

/** Lowercases, strips special characters, and hyphenates a filename for SEO. */
export function slugifyFileName(name: string): string {
  const withoutExt = name.replace(/\.[a-zA-Z0-9]+$/, "");
  return withoutExt
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100) || "image";
}

/** Ensures a filename is unique within outputDir by appending -2, -3, etc. */
function ensureUniqueFileName(outputDir: string, baseName: string, ext: string): string {
  let candidate = `${baseName}.${ext}`;
  let counter = 2;
  while (fs.existsSync(path.join(outputDir, candidate))) {
    candidate = `${baseName}-${counter}.${ext}`;
    counter += 1;
  }
  return candidate;
}

export async function processImage(options: ProcessImageOptions): Promise<ProcessImageResult> {
  const originalStat = fs.statSync(options.inputPath);
  fs.mkdirSync(options.outputDir, { recursive: true });

  const slug = slugifyFileName(options.desiredFileName);
  const ext = options.format === "jpg" ? "jpg" : options.format;
  const fileName = ensureUniqueFileName(options.outputDir, slug, ext);
  const outputPath = path.join(options.outputDir, fileName);

  let pipeline = sharp(options.inputPath).resize(options.targetWidth, options.targetHeight, {
    fit: "cover",
    position: "attention"
  });

  if (options.format === "webp") {
    pipeline = pipeline.webp({ quality: options.quality });
  } else if (options.format === "jpg") {
    pipeline = pipeline.jpeg({ quality: options.quality, mozjpeg: true });
  } else {
    pipeline = pipeline.png({ quality: options.quality });
  }

  await pipeline.toFile(outputPath);

  // If a max file size is configured and we're over it, step compression
  // down progressively (a simple, effective approach for web delivery).
  if (options.maxFileSizeBytes) {
    let currentQuality = options.quality;
    let currentSize = fs.statSync(outputPath).size;
    while (currentSize > options.maxFileSizeBytes && currentQuality > 30) {
      currentQuality -= 10;
      let retryPipeline = sharp(options.inputPath).resize(options.targetWidth, options.targetHeight, {
        fit: "cover",
        position: "attention"
      });
      if (options.format === "webp") retryPipeline = retryPipeline.webp({ quality: currentQuality });
      else if (options.format === "jpg")
        retryPipeline = retryPipeline.jpeg({ quality: currentQuality, mozjpeg: true });
      else retryPipeline = retryPipeline.png({ quality: currentQuality });

      await retryPipeline.toFile(outputPath);
      currentSize = fs.statSync(outputPath).size;
    }
  }

  const processedStat = fs.statSync(outputPath);

  return {
    outputPath,
    fileName,
    originalSizeBytes: originalStat.size,
    processedSizeBytes: processedStat.size
  };
}

/** Maps an image_type from the AI plan to the app's default size presets. */
export function sizeForImageType(imageType: string): { width: number; height: number } {
  switch (imageType) {
    case "featured_image":
      return { width: 1600, height: 900 };
    case "hero_image":
      return { width: 1920, height: 1080 };
    case "cta_image":
      return { width: 1600, height: 700 };
    case "infographic":
      return { width: 1200, height: 1600 };
    case "section_image":
    default:
      return { width: 1200, height: 800 };
  }
}

/** Parses a "WIDTHxHEIGHT" string from the AI plan, falling back to a default. */
export function parseSizeString(size: string, fallback: { width: number; height: number }) {
  const match = size.match(/(\d+)\s*x\s*(\d+)/i);
  if (!match) return fallback;
  return { width: parseInt(match[1], 10), height: parseInt(match[2], 10) };
}
