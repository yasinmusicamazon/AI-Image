import axios from "axios";
import type { ApiKeyTestResult } from "./openai";

/**
 * Validates a Gemini API key via the lightweight ListModels endpoint.
 * Actual image generation is implemented in Phase 3.
 */
export async function testGeminiKey(apiKey: string): Promise<ApiKeyTestResult> {
  try {
    const res = await axios.get(
      "https://generativelanguage.googleapis.com/v1beta/models",
      {
        params: { key: apiKey },
        timeout: 15000,
        validateStatus: () => true
      }
    );

    if (res.status === 200) {
      return { success: true, message: "Gemini API key is valid." };
    }
    if (res.status === 400 || res.status === 403) {
      return { success: false, message: "Gemini rejected the key (invalid or unauthorized)." };
    }
    return { success: false, message: `Gemini returned HTTP ${res.status}.` };
  } catch (err) {
    return { success: false, message: `Could not reach Gemini: ${errorMessage(err)}` };
  }
}

function errorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) return err.message;
  return err instanceof Error ? err.message : String(err);
}
