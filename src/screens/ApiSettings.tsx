import { useEffect, useState } from "react";
import type { ApiSettings } from "../../electron/types";
import type { ApiKeyStatus } from "../lib/window-api";

// Curated from each provider's official model docs. Verified current as of
// July 2026 — https://developers.openai.com/api/docs/models/all and
// https://ai.google.dev/gemini-api/docs/image-generation. Image model
// lineups change often, so a "Custom" option is always available below in
// case a newer model ships before this list is updated.
const OPENAI_IMAGE_MODELS: { value: string; label: string }[] = [
  { value: "gpt-image-2", label: "GPT Image 2 (recommended — current flagship)" },
  { value: "gpt-image-1.5", label: "GPT Image 1.5 (deprecated by OpenAI)" },
  { value: "gpt-image-1", label: "GPT Image 1 (deprecated by OpenAI)" },
  { value: "gpt-image-1-mini", label: "GPT Image 1 Mini (deprecated by OpenAI)" },
  { value: "chatgpt-image-latest", label: "ChatGPT Image Latest (deprecated by OpenAI)" },
  { value: "dall-e-3", label: "DALL·E 3 (deprecated by OpenAI)" },
  { value: "dall-e-2", label: "DALL·E 2 (deprecated by OpenAI)" }
];

const GEMINI_IMAGE_MODELS: { value: string; label: string }[] = [
  { value: "gemini-3.1-flash-image", label: "Nano Banana 2 — Gemini 3.1 Flash Image (recommended default)" },
  { value: "gemini-3-pro-image", label: "Nano Banana Pro — Gemini 3 Pro Image (premium quality)" },
  { value: "gemini-3.1-flash-lite-image", label: "Nano Banana 2 Lite — Gemini 3.1 Flash Lite Image (fastest/cheapest)" },
  { value: "gemini-2.5-flash-image", label: "Nano Banana — Gemini 2.5 Flash Image (legacy)" }
];

const CUSTOM_VALUE = "__custom__";

export default function ApiSettingsScreen() {
  const [settings, setSettings] = useState<ApiSettings | null>(null);
  const [openaiKeyInput, setOpenaiKeyInput] = useState("");
  const [geminiKeyInput, setGeminiKeyInput] = useState("");
  const [showOpenaiKey, setShowOpenaiKey] = useState(false);
  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [openaiStatus, setOpenaiStatus] = useState<ApiKeyStatus | null>(null);
  const [geminiStatus, setGeminiStatus] = useState<ApiKeyStatus | null>(null);
  const [testing, setTesting] = useState<"openai" | "gemini" | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    setLoadError(null);
    try {
      if (!window.api?.settings) {
        throw new Error(
          "The app's backend bridge (window.api) is not available. This usually means the preload script failed to load — try restarting the app, and check Help > Open Logs Folder."
        );
      }
      const [s, status] = await Promise.all([
        window.api.settings.getApiSettings(),
        window.api.settings.getApiKeyStatus()
      ]);
      setSettings(s);
      setOpenaiStatus(status.openai);
      setGeminiStatus(status.gemini);
    } catch (err) {
      setLoadError((err as Error).message || "Failed to load API settings.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function handleSaveKey(provider: "openai" | "gemini") {
    const value = provider === "openai" ? openaiKeyInput : geminiKeyInput;
    if (!value.trim()) return;
    try {
      await window.api.settings.saveApiKey(provider, value.trim());
      if (provider === "openai") setOpenaiKeyInput("");
      else setGeminiKeyInput("");
      setSavedMsg(`${provider === "openai" ? "OpenAI" : "Gemini"} key saved securely.`);
      setTimeout(() => setSavedMsg(null), 3000);
      await refresh();
    } catch (err) {
      setLoadError(`Failed to save ${provider} key: ${(err as Error).message}`);
    }
  }

  async function handleTestKey(provider: "openai" | "gemini") {
    setTesting(provider);
    try {
      await window.api.settings.testApiKey(provider);
    } catch (err) {
      setLoadError(`Failed to test ${provider} key: ${(err as Error).message}`);
    } finally {
      setTesting(null);
      await refresh();
    }
  }

  async function handleSaveSettings() {
    if (!settings) return;
    try {
      await window.api.settings.setApiSettings(settings);
      setSavedMsg("Settings saved.");
      setTimeout(() => setSavedMsg(null), 3000);
    } catch (err) {
      setLoadError(`Failed to save settings: ${(err as Error).message}`);
    }
  }

  if (loading) {
    return <div className="empty-state">Loading API settings…</div>;
  }

  if (loadError && !settings) {
    return (
      <>
        <div className="page-header">
          <h1>API Settings</h1>
        </div>
        <div className="panel">
          <div className="inline-msg error">{loadError}</div>
          <div className="btn-row" style={{ marginTop: 12 }}>
            <button className="btn" onClick={refresh}>
              Retry
            </button>
          </div>
        </div>
      </>
    );
  }

  if (!settings) return null;

  return (
    <>
      <div className="page-header">
        <h1>API Settings</h1>
        <p>Connect OpenAI and Gemini, choose default models, and tune request behavior.</p>
      </div>

      {loadError && (
        <div className="inline-msg error" style={{ marginBottom: 16 }}>
          {loadError}
        </div>
      )}

      <div className="panel">
        <h2>OpenAI</h2>
        <ProviderKeyRow
          label="OpenAI API Key"
          placeholder="sk-..."
          value={openaiKeyInput}
          onChange={setOpenaiKeyInput}
          onSave={() => handleSaveKey("openai")}
          onTest={() => handleTestKey("openai")}
          testing={testing === "openai"}
          status={openaiStatus}
          show={showOpenaiKey}
          onToggleShow={() => setShowOpenaiKey((v) => !v)}
        />
        <div className="form-row">
          <label>Model</label>
          <ModelSelect
            options={OPENAI_IMAGE_MODELS}
            value={settings.openaiModel}
            onChange={(v) => setSettings({ ...settings, openaiModel: v })}
          />
        </div>
      </div>

      <div className="panel">
        <h2>Gemini</h2>
        <ProviderKeyRow
          label="Gemini API Key"
          placeholder="AIza..."
          value={geminiKeyInput}
          onChange={setGeminiKeyInput}
          onSave={() => handleSaveKey("gemini")}
          onTest={() => handleTestKey("gemini")}
          testing={testing === "gemini"}
          status={geminiStatus}
          show={showGeminiKey}
          onToggleShow={() => setShowGeminiKey((v) => !v)}
        />
        <div className="form-row">
          <label>Model</label>
          <ModelSelect
            options={GEMINI_IMAGE_MODELS}
            value={settings.geminiModel}
            onChange={(v) => setSettings({ ...settings, geminiModel: v })}
          />
        </div>
      </div>

      <div className="panel">
        <h2>Defaults &amp; Request Behavior</h2>
        <div className="form-row">
          <label>Default AI Provider</label>
          <select
            value={settings.defaultProvider}
            onChange={(e) =>
              setSettings({ ...settings, defaultProvider: e.target.value as ApiSettings["defaultProvider"] })
            }
          >
            <option value="manual">Ask me per job</option>
            <option value="openai">OpenAI</option>
            <option value="gemini">Gemini</option>
          </select>
        </div>
        <div className="form-row">
          <label>Request Timeout (ms)</label>
          <input
            type="number"
            value={settings.requestTimeoutMs}
            onChange={(e) => setSettings({ ...settings, requestTimeoutMs: Number(e.target.value) })}
          />
        </div>
        <div className="form-row">
          <label>Max Retries</label>
          <input
            type="number"
            value={settings.maxRetries}
            onChange={(e) => setSettings({ ...settings, maxRetries: Number(e.target.value) })}
          />
        </div>
        <div className="form-row">
          <label>Rate Limit (requests / minute)</label>
          <input
            type="number"
            value={settings.rateLimitPerMinute}
            onChange={(e) => setSettings({ ...settings, rateLimitPerMinute: Number(e.target.value) })}
          />
        </div>
        <div className="btn-row">
          <button className="btn" onClick={handleSaveSettings}>
            Save Settings
          </button>
        </div>
        {savedMsg && <div className="inline-msg success">{savedMsg}</div>}
        <p style={{ color: "var(--text-muted)", fontSize: 12, marginTop: 12 }}>
          Cost tracking is estimated once image generation (Phase 3) is wired up, based on each
          provider's published per-image pricing and your job volume.
        </p>
      </div>
    </>
  );
}

function ModelSelect({
  options,
  value,
  onChange
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  const isKnown = options.some((o) => o.value === value);
  const [customText, setCustomText] = useState(isKnown ? "" : value);
  const selectValue = isKnown ? value : CUSTOM_VALUE;

  return (
    <div>
      <select
        value={selectValue}
        onChange={(e) => {
          if (e.target.value === CUSTOM_VALUE) {
            onChange(customText);
          } else {
            onChange(e.target.value);
          }
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
        <option value={CUSTOM_VALUE}>Custom (enter model ID manually)…</option>
      </select>
      {selectValue === CUSTOM_VALUE && (
        <input
          style={{ marginTop: 8 }}
          value={customText}
          placeholder="e.g. a newly released model ID"
          onChange={(e) => {
            setCustomText(e.target.value);
            onChange(e.target.value);
          }}
        />
      )}
    </div>
  );
}

function ProviderKeyRow({
  label,
  placeholder,
  value,
  onChange,
  onSave,
  onTest,
  testing,
  status,
  show,
  onToggleShow
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  onSave: () => void;
  onTest: () => void;
  testing: boolean;
  status: ApiKeyStatus | null;
  show: boolean;
  onToggleShow: () => void;
}) {
  return (
    <div className="form-row">
      <label>{label}</label>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          type={show ? "text" : "password"}
          value={value}
          placeholder={status?.configured ? "•••••••••••••••• (saved)" : placeholder}
          onChange={(e) => onChange(e.target.value)}
          style={{ flex: 1 }}
        />
        <button type="button" className="btn secondary" onClick={onToggleShow}>
          {show ? "Hide" : "Show"}
        </button>
        <button className="btn secondary" onClick={onSave} disabled={!value.trim()}>
          Save
        </button>
        <button className="btn secondary" onClick={onTest} disabled={testing || !status?.configured}>
          {testing ? "Testing…" : "Test"}
        </button>
      </div>
      {status?.lastTestResult && (
        <div className={`inline-msg ${status.lastTestResult === "success" ? "success" : "error"}`}>
          {status.lastTestMessage}
        </div>
      )}
    </div>
  );
}
