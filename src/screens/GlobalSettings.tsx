import { useEffect, useState } from "react";
import type { GlobalSettings, PromptTemplate } from "../../electron/types";

export default function GlobalSettingsScreen() {
  const [settings, setSettings] = useState<GlobalSettings | null>(null);
  const [templates, setTemplates] = useState<PromptTemplate[]>([]);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    window.api.settings.getGlobalSettings().then(setSettings).catch((e) => setError(e.message));
    window.api.templates.list().then(setTemplates);
  }, []);

  async function handleSave() {
    if (!settings) return;
    try {
      await window.api.settings.setGlobalSettings(settings);
      setSavedMsg("Global settings saved.");
      setTimeout(() => setSavedMsg(null), 3000);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  if (!settings) return <div className="empty-state">Loading…</div>;

  return (
    <>
      <div className="page-header">
        <h1>Global Settings</h1>
        <p>Defaults and automation behavior applied across all websites, unless overridden per site.</p>
      </div>

      {error && <div className="inline-msg error">{error}</div>}

      <div className="panel">
        <h2>Defaults</h2>
        <div className="form-row">
          <label>Default images per page</label>
          <select
            value={settings.defaultImagesPerPage}
            onChange={(e) => setSettings({ ...settings, defaultImagesPerPage: Number(e.target.value) })}
          >
            <option value={1}>1</option>
            <option value={2}>2</option>
            <option value={3}>3</option>
            <option value={4}>4</option>
          </select>
        </div>
        <div className="form-row">
          <label>Default AI provider</label>
          <select
            value={settings.defaultProvider}
            onChange={(e) =>
              setSettings({ ...settings, defaultProvider: e.target.value as GlobalSettings["defaultProvider"] })
            }
          >
            <option value="manual">Ask me per job</option>
            <option value="openai">OpenAI</option>
            <option value="gemini">Gemini</option>
          </select>
        </div>
        <div className="form-row">
          <label>Default prompt template</label>
          <select
            value={settings.activeTemplateId ?? ""}
            onChange={(e) => setSettings({ ...settings, activeTemplateId: e.target.value || null })}
          >
            <option value="">None</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        <div className="form-row">
          <label>Default image format</label>
          <select
            value={settings.defaultImageFormat}
            onChange={(e) =>
              setSettings({ ...settings, defaultImageFormat: e.target.value as GlobalSettings["defaultImageFormat"] })
            }
          >
            <option value="webp">WebP</option>
            <option value="jpg">JPG</option>
            <option value="png">PNG</option>
          </select>
        </div>
        <div className="form-row">
          <label>Default compression quality (1–100)</label>
          <input
            type="number"
            min={1}
            max={100}
            value={settings.defaultCompressionQuality}
            onChange={(e) => setSettings({ ...settings, defaultCompressionQuality: Number(e.target.value) })}
          />
        </div>
      </div>

      <div className="panel">
        <h2>Automation &amp; Safety</h2>
        <ToggleRow
          label="Auto-approve generated images"
          checked={settings.autoApproveImages}
          onChange={(v) => setSettings({ ...settings, autoApproveImages: v })}
        />
        <ToggleRow
          label="Auto-upload to WordPress Media after approval"
          checked={settings.autoUploadAfterApproval}
          onChange={(v) => setSettings({ ...settings, autoUploadAfterApproval: v })}
        />
        <ToggleRow
          label="Auto-insert into page/post after upload"
          checked={settings.autoInsertAfterUpload}
          onChange={(v) => setSettings({ ...settings, autoInsertAfterUpload: v })}
        />
        <ToggleRow
          label="Dry-run mode (plan and generate, but never write to live WordPress content)"
          checked={settings.dryRunMode}
          onChange={(v) => setSettings({ ...settings, dryRunMode: v })}
        />
        <ToggleRow
          label="Backup before update (always enforced — cannot be disabled)"
          checked={true}
          onChange={() => {}}
          disabled
        />
        <ToggleRow
          label="Watermark detection enabled"
          checked={settings.watermarkDetectionEnabled}
          onChange={(v) => setSettings({ ...settings, watermarkDetectionEnabled: v })}
        />
        <ToggleRow
          label="Require manual approval before live update"
          checked={settings.manualApprovalRequired}
          onChange={(v) => setSettings({ ...settings, manualApprovalRequired: v })}
        />

        <div className="btn-row" style={{ marginTop: 16 }}>
          <button className="btn" onClick={handleSave}>
            Save Global Settings
          </button>
        </div>
        {savedMsg && <div className="inline-msg success">{savedMsg}</div>}
      </div>
    </>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
  disabled
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "10px 0",
        borderBottom: "1px solid var(--border)"
      }}
    >
      <span style={{ fontSize: 13.5 }}>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        style={{ width: 18, height: 18 }}
      />
    </div>
  );
}
