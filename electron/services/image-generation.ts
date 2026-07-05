import axios from "axios";
import fs from "fs";
import path from "path";

export interface GeneratedImageFile {
  localPath: string;
  fileSizeBytes: number;
}

/**
 * Generates an image with an OpenAI GPT Image model and writes it to disk.
 * GPT Image models return base64-encoded PNG data (b64_json), not a URL.
 */
export async function generateImageOpenAI(
  apiKey: string,
  model: string,
  prompt: string,
  outputDir: string,
  fileBaseName: string
): Promise<GeneratedImageFile> {
  const res = await axios.post(
    "https://api.openai.com/v1/images/generations",
    {
      model,
      prompt,
      size: "1536x1024",
      n: 1
    },
    {
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      timeout: 120000,
      validateStatus: () => true
    }
  );

  if (res.status !== 200) {
    throw new Error(
      `OpenAI image generation failed (HTTP ${res.status}): ${JSON.stringify(res.data).slice(0, 300)}`
    );
  }

  const b64 = res.data?.data?.[0]?.b64_json;
  const url = res.data?.data?.[0]?.url;

  fs.mkdirSync(outputDir, { recursive: true });
  const localPath = path.join(outputDir, `${fileBaseName}.png`);

  if (b64) {
    fs.writeFileSync(localPath, Buffer.from(b64, "base64"));
  } else if (url) {
    const imgRes = await axios.get(url, { responseType: "arraybuffer", timeout: 60000 });
    fs.writeFileSync(localPath, Buffer.from(imgRes.data));
  } else {
    throw new Error("OpenAI image response contained neither b64_json nor url.");
  }

  const stat = fs.statSync(localPath);
  return { localPath, fileSizeBytes: stat.size };
}

/**
 * Generates an image with a Gemini "Nano Banana" image model via the
 * generateContent endpoint (multimodal output — the model can return
 * inline base64 image parts directly).
 */
export async function generateImageGemini(
  apiKey: string,
  model: string,
  prompt: string,
  outputDir: string,
  fileBaseName: string
): Promise<GeneratedImageFile> {
  const res = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      contents: [{ role: "user", parts: [{ text: prompt }] }]
    },
    {
      params: { key: apiKey },
      headers: { "Content-Type": "application/json" },
      timeout: 120000,
      validateStatus: () => true
    }
  );

  if (res.status !== 200) {
    throw new Error(
      `Gemini image generation failed (HTTP ${res.status}): ${JSON.stringify(res.data).slice(0, 300)}`
    );
  }

  const parts = res.data?.candidates?.[0]?.content?.parts ?? [];
  const imagePart = parts.find((p: Record<string, unknown>) => (p as any).inlineData?.data);
  const b64 = imagePart?.inlineData?.data;
  const mimeType: string = imagePart?.inlineData?.mimeType ?? "image/png";

  if (!b64) {
    throw new Error("Gemini response did not include an inline image part.");
  }

  const ext = mimeType.includes("png") ? "png" : mimeType.includes("webp") ? "webp" : "jpg";
  fs.mkdirSync(outputDir, { recursive: true });
  const localPath = path.join(outputDir, `${fileBaseName}.${ext}`);
  fs.writeFileSync(localPath, Buffer.from(b64, "base64"));

  const stat = fs.statSync(localPath);
  return { localPath, fileSizeBytes: stat.size };
}
