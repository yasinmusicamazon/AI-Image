import axios from "axios";
import fs from "fs";

export interface WatermarkCheckResult {
  watermarkDetected: boolean;
  reason: string;
}

/**
 * IMPORTANT — scope of this check:
 * This is NOT pixel-level forensic watermark detection (e.g. detecting a
 * SynthID signature or matching known stock-photo watermark templates).
 * That requires specialized ML models this app does not bundle. Instead,
 * this asks a vision-capable LLM to visually inspect the image and flag
 * anything that LOOKS like a visible watermark, stock-photo mark, logo,
 * or embedded text overlay that would make the image unsafe to publish
 * commercially. This catches the common, visible cases (a "Shutterstock"
 * or "Getty Images" diagonal mark, a visible logo, stray on-image text)
 * but is not a guarantee against subtle or invisible watermarking.
 */
export async function checkWatermarkOpenAI(
  apiKey: string,
  imagePath: string
): Promise<WatermarkCheckResult> {
  const imageBase64 = fs.readFileSync(imagePath).toString("base64");
  const mimeType = imagePath.endsWith(".png") ? "image/png" : "image/jpeg";

  const res = await axios.post(
    "https://api.openai.com/v1/chat/completions",
    {
      model: "gpt-4.1-mini",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Look at this image. Does it contain any of the following: a visible watermark, a stock-photo agency mark (e.g. Shutterstock, Getty, Adobe Stock, iStock), a visible brand logo, or stray readable text overlaid on the image that looks unintentional? Respond with ONLY JSON: {"watermark_detected": true|false, "reason": "short explanation"}`
            },
            { type: "image_url", image_url: { url: `data:${mimeType};base64,${imageBase64}` } }
          ]
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0
    },
    {
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      timeout: 45000,
      validateStatus: () => true
    }
  );

  if (res.status !== 200) {
    throw new Error(`Watermark check failed (HTTP ${res.status}): ${JSON.stringify(res.data).slice(0, 300)}`);
  }

  const content = res.data?.choices?.[0]?.message?.content;
  if (!content) throw new Error("Watermark check response had no content.");

  const parsed = JSON.parse(content);
  return {
    watermarkDetected: Boolean(parsed.watermark_detected),
    reason: String(parsed.reason ?? "")
  };
}

export async function checkWatermarkGemini(
  apiKey: string,
  imagePath: string
): Promise<WatermarkCheckResult> {
  const imageBase64 = fs.readFileSync(imagePath).toString("base64");
  const mimeType = imagePath.endsWith(".png") ? "image/png" : "image/jpeg";

  const res = await axios.post(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
    {
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `Look at this image. Does it contain any of the following: a visible watermark, a stock-photo agency mark (e.g. Shutterstock, Getty, Adobe Stock, iStock), a visible brand logo, or stray readable text overlaid on the image that looks unintentional? Respond with ONLY JSON: {"watermark_detected": true|false, "reason": "short explanation"}`
            },
            { inlineData: { mimeType, data: imageBase64 } }
          ]
        }
      ],
      generationConfig: { responseMimeType: "application/json", temperature: 0 }
    },
    {
      params: { key: apiKey },
      headers: { "Content-Type": "application/json" },
      timeout: 45000,
      validateStatus: () => true
    }
  );

  if (res.status !== 200) {
    throw new Error(`Watermark check failed (HTTP ${res.status}): ${JSON.stringify(res.data).slice(0, 300)}`);
  }

  const content = res.data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!content) throw new Error("Watermark check response had no content.");

  const parsed = JSON.parse(content);
  return {
    watermarkDetected: Boolean(parsed.watermark_detected),
    reason: String(parsed.reason ?? "")
  };
}
