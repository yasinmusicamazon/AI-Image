import axios from "axios";

export interface ImagePlanItem {
  image_type: "featured_image" | "hero_image" | "section_image" | "cta_image" | "infographic";
  purpose: string;
  prompt: string;
  file_name: string;
  alt_text: string;
  caption: string;
  placement:
    | "featured_image"
    | "after_first_h2"
    | "after_second_h2"
    | "before_faq"
    | "before_final_cta"
    | "manual_only";
  size: string;
}

export interface ImagePlanInput {
  pageTitle: string;
  slug: string;
  headings: string[];
  contentExcerpt: string;
  imageCount: number;
  templateStyle: string;
  templateAvoid: string;
  brandNotes: string;
}

const SYSTEM_INSTRUCTIONS = `You are an SEO and web design assistant for a WordPress content site. Given a page's title, headings, and content, recommend a small set of images that would genuinely improve the page. Respond with ONLY valid JSON, no markdown fences, no commentary — an array of image plan objects matching this exact shape:
[{
  "image_type": "featured_image" | "hero_image" | "section_image" | "cta_image" | "infographic",
  "purpose": "short description of why this image helps this page",
  "prompt": "a detailed, realistic, professional image-generation prompt — no logos, no brand names, no on-image text unless explicitly useful, no disturbing content, calm and respectful tone for sensitive health/treatment topics",
  "file_name": "seo-friendly-lowercase-hyphenated-filename.webp",
  "alt_text": "natural, descriptive alt text — not keyword stuffed",
  "caption": "short caption, or empty string if not useful",
  "placement": "featured_image" | "after_first_h2" | "after_second_h2" | "before_faq" | "before_final_cta" | "manual_only",
  "size": "WIDTHxHEIGHT, choose from 1600x900 (featured), 1920x1080 (hero), 1200x800 (section), 1600x700 (cta background), 800x600 (blog card)"
}]
Do not recommend more images than requested. If the page already seems image-heavy based on its headings, it is fine to recommend fewer.`;

function buildUserPrompt(input: ImagePlanInput): string {
  return `Page title: ${input.pageTitle}
Slug: ${input.slug}
Headings found in the page: ${input.headings.length > 0 ? input.headings.join(" | ") : "(none found)"}
Content excerpt: ${input.contentExcerpt.slice(0, 2000)}

Recommend exactly ${input.imageCount} image(s) for this page.
Visual style guidance: ${input.templateStyle || "realistic, professional, premium website style"}
Things to avoid: ${input.templateAvoid || "logos, brand names, on-image text, disturbing content"}
Brand/style notes for this site: ${input.brandNotes || "(none)"}`;
}

function extractJsonArray(text: string): string {
  // Models occasionally wrap JSON in markdown fences despite instructions.
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  return fenced ? fenced[1].trim() : text.trim();
}

export async function generateImagePlanOpenAI(
  apiKey: string,
  model: string,
  input: ImagePlanInput
): Promise<ImagePlanItem[]> {
  // Uses a text-capable chat model for planning (not the image model itself
  // — gpt-image-2 etc. only generate pixels, not structured JSON reasoning).
  const planningModel = "gpt-4.1-mini";
  const res = await axios.post(
    "https://api.openai.com/v1/chat/completions",
    {
      model: planningModel,
      messages: [
        { role: "system", content: SYSTEM_INSTRUCTIONS },
        { role: "user", content: buildUserPrompt(input) }
      ],
      response_format: { type: "json_object" },
      temperature: 0.4
    },
    {
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      timeout: 45000,
      validateStatus: () => true
    }
  );

  if (res.status !== 200) {
    throw new Error(`OpenAI planning request failed (HTTP ${res.status}): ${JSON.stringify(res.data).slice(0, 300)}`);
  }

  const content = res.data?.choices?.[0]?.message?.content;
  if (!content) throw new Error("OpenAI response did not include plan content.");

  return parsePlanJson(content);
}

export async function generateImagePlanGemini(
  apiKey: string,
  input: ImagePlanInput
): Promise<ImagePlanItem[]> {
  // Uses a fast text model for planning, independent of which image model
  // the user has selected for actual generation.
  const planningModel = "gemini-2.5-flash";
  const res = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/models/${planningModel}:generateContent`,
    {
      contents: [
        {
          role: "user",
          parts: [{ text: `${SYSTEM_INSTRUCTIONS}\n\n${buildUserPrompt(input)}` }]
        }
      ],
      generationConfig: { responseMimeType: "application/json", temperature: 0.4 }
    },
    {
      params: { key: apiKey },
      headers: { "Content-Type": "application/json" },
      timeout: 45000,
      validateStatus: () => true
    }
  );

  if (res.status !== 200) {
    throw new Error(`Gemini planning request failed (HTTP ${res.status}): ${JSON.stringify(res.data).slice(0, 300)}`);
  }

  const content = res.data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!content) throw new Error("Gemini response did not include plan content.");

  return parsePlanJson(content);
}

function parsePlanJson(raw: string): ImagePlanItem[] {
  const jsonText = extractJsonArray(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (err) {
    throw new Error(`AI response was not valid JSON: ${(err as Error).message}`);
  }

  // Models sometimes wrap the array in an object like { "images": [...] }
  // despite instructions; handle both shapes defensively.
  const arr = Array.isArray(parsed)
    ? parsed
    : (parsed as Record<string, unknown>)?.images ??
      (parsed as Record<string, unknown>)?.plan ??
      null;

  if (!Array.isArray(arr)) {
    throw new Error("AI response JSON did not contain an image plan array.");
  }

  return arr as ImagePlanItem[];
}

/** Extracts H2 heading text from WordPress Gutenberg/HTML content for planning context. */
export function extractHeadings(rawContentHtml: string): string[] {
  const matches = [...rawContentHtml.matchAll(/<h2[^>]*>(.*?)<\/h2>/gis)];
  return matches
    .map((m) => m[1].replace(/<[^>]+>/g, "").trim())
    .filter((h) => h.length > 0);
}

/** Strips HTML tags for a plain-text excerpt to feed to the planning model. */
export function stripHtmlToExcerpt(rawContentHtml: string, maxLength = 2500): string {
  const text = rawContentHtml
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.slice(0, maxLength);
}
