import { useEffect, useState } from "react";
import type { ApiSettings } from "../../electron/types";
import type { ApiKeyStatus } from "../lib/window-api";

export default function ApiSettingsScreen() {
  const [settings, setSettings] = useState<ApiSettings | null>(null);
  const [openaiKeyInput, setOpenaiKeyInput] = useState("");
  const [geminiKeyInput, setGeminiKeyInput] = useState("");
  const [openaiStatus, setOpenaiStatus] = useState<ApiKeyStatus | null>(null);
  const [geminiStatus, setGeminiStatus] = useState<ApiKeyStatus | null>(null);
  const [testing, setTesting] = useState<"openai" | "gemini" | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  async function refresh() {
    const [s, status] = await Promise.all([
      window.api.settings.getApiSettings(),
      window.api.settings.getApiKeyStatus()
    ]);
    setSettings(s);
    setOpenaiStatus(status.openai);
    setGeminiStatus(status.gemini);
  }

  useEffect(() => {
    refresh();
  }, []);

  async function handleSaveKey(provider: "openai" | "gemini") {
    const value = provider === "openai" ? openaiKeyInput : geminiKeyInput;
    if (!value.trim()) return;
    await window.api.settings.saveApiKey(provider, value.trim());
    if (provider === "openai") setOpenaiKeyInput("");
    else setGeminiKeyInput("");
    setSavedMsg(`${provider === "openai" ? "OpenAI" : "Gemini"} key saved securely.`);
    setTimeout(() => setSavedMsg(null), 3000);
    await refresh();
  }

  async function handleTestKey(provider: "openai" | "gemini") {
    setTesting(provider);
    try {
      await window.api.settings.testApiKey(provider);
    } finally {
      setTesting(null);
      await refresh();
    }
  }

  async function handleSaveSettings() {
    if (!settings) return;
    await window.api.settings.setApiSettings(settings);
    setSavedMsg("Settings saved.");
    setTimeout(() => setSavedMsg(null), 3000);
  }

  if (!settings) return <div className="empty-state">Loading…</div>;

  return (
    <>
      <div className="page-header">
        <h1>API Settings</h1>
        <p>Connect OpenAI and Gemini, choose default models, and tune request behavior.</p>
      </div>

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
        />
        <div className="form-row">
          <label>Model</label>
          <input
            value={settings.openaiModel}
            onChange={(e) => setSettings({ ...settings, openaiModel: e.target.value })}
            placeholder="gpt-image-1"
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
        />
        <div className="form-row">
          <label>Model</label>
          <input
            value={settings.geminiModel}
            onChange={(e) => setSettings({ ...settings, geminiModel: e.target.value })}
            placeholder="gemini-2.5-flash-image"
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

function ProviderKeyRow({
  label,
  placeholder,
  value,
  onChange,
  onSave,
  onTest,
  testing,
  status
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  onSave: () => void;
  onTest: () => void;
  testing: boolean;
  status: ApiKeyStatus | null;
}) {
  return (
    <div className="form-row">
      <label>{label}</label>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          type="password"
          value={value}
          placeholder={status?.configured ? "•••••••••••••••• (saved)" : placeholder}
          onChange={(e) => onChange(e.target.value)}
          style={{ flex: 1 }}
        />
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
