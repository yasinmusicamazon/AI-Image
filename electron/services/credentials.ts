import keytar from "keytar";
import Store from "electron-store";
import crypto from "crypto";
import { safeStorage } from "electron";

// Service name namespaces all our keychain entries so we never collide
// with another app's credentials in the same OS keychain.
const SERVICE_NAME = "WP-AI-Image-Publisher";

// Fallback store, used ONLY if the OS keychain is unavailable (some Linux
// distros without a Secret Service provider). Values here are encrypted
// with Electron's safeStorage (backed by OS-level DPAPI/Keychain/libsecret)
// before ever touching disk — never plain text.
const fallbackStore = new Store<{ [key: string]: string }>({
  name: "secure-fallback",
  // Belt-and-suspenders: even the fallback file only ever holds
  // safeStorage-encrypted ciphertext, never a raw secret.
});

async function keytarAvailable(): Promise<boolean> {
  try {
    await keytar.findCredentials(SERVICE_NAME);
    return true;
  } catch {
    return false;
  }
}

/**
 * Stores a secret (API key, WordPress application password, etc.) under
 * a given account name. Prefers the OS keychain; falls back to an
 * encrypted local file only if the keychain is genuinely unavailable.
 * Never writes plaintext to disk and never logs the secret value.
 */
export async function setSecret(account: string, secret: string): Promise<void> {
  if (await keytarAvailable()) {
    await keytar.setPassword(SERVICE_NAME, account, secret);
    return;
  }

  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error(
      "No secure storage backend is available on this system (OS keychain and safeStorage both unavailable)."
    );
  }
  const encrypted = safeStorage.encryptString(secret).toString("base64");
  fallbackStore.set(account, encrypted);
}

export async function getSecret(account: string): Promise<string | null> {
  if (await keytarAvailable()) {
    return keytar.getPassword(SERVICE_NAME, account);
  }

  const encrypted = fallbackStore.get(account);
  if (!encrypted) return null;
  if (!safeStorage.isEncryptionAvailable()) return null;
  return safeStorage.decryptString(Buffer.from(encrypted, "base64"));
}

export async function deleteSecret(account: string): Promise<void> {
  if (await keytarAvailable()) {
    await keytar.deletePassword(SERVICE_NAME, account);
    return;
  }
  fallbackStore.delete(account);
}

/**
 * Generates a unique, non-secret account name to reference a website's
 * stored application password. This value is safe to persist in SQLite;
 * the actual password is looked up from the keychain using this key.
 */
export function generateCredentialKey(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

// Well-known account names for the two supported AI providers.
export const CREDENTIAL_KEYS = {
  openaiApiKey: "openai-api-key",
  geminiApiKey: "gemini-api-key"
} as const;
