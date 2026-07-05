import axios from "axios";

export interface ApiKeyTestResult {
  success: boolean;
  message: string;
}

/**
 * Validates an OpenAI API key by calling a cheap, side-effect-free
 * endpoint (list models). We deliberately do NOT generate an image here —
 * that costs money and belongs to the Phase 3 generation flow.
 */
export async function testOpenAiKey(apiKey: string): Promise<ApiKeyTestResult> {
  try {
    const res = await axios.get("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
      timeout: 15000,
      validateStatus: () => true
    });

    if (res.status === 200) {
      return { success: true, message: "OpenAI API key is valid." };
    }
    if (res.status === 401) {
      return { success: false, message: "OpenAI rejected the key (401 Unauthorized)." };
    }
    return { success: false, message: `OpenAI returned HTTP ${res.status}.` };
  } catch (err) {
    return { success: false, message: `Could not reach OpenAI: ${errorMessage(err)}` };
  }
}

function errorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) return err.message;
  return err instanceof Error ? err.message : String(err);
}
