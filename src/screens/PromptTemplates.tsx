import { useEffect, useState } from "react";
import type { PromptTemplate } from "../../electron/types";

const EMPTY_FORM = {
  name: "",
  imageStyle: "",
  thingsToAvoid: "",
  altTextRules: "",
  filenameRules: "",
  promptFormat: "",
  defaultImageCount: 2
};

export default function PromptTemplatesScreen() {
  const [templates, setTemplates] = useState<PromptTemplate[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setTemplates(await window.api.templates.list());
  }

  useEffect(() => {
    refresh();
  }, []);

  function startEdit(t: PromptTemplate) {
    setEditingId(t.id);
    setForm({
      name: t.name,
      imageStyle: t.imageStyle,
      thingsToAvoid: t.thingsToAvoid,
      altTextRules: t.altTextRules,
      filenameRules: t.filenameRules,
      promptFormat: t.promptFormat,
      defaultImageCount: t.defaultImageCount
    });
    setShowForm(true);
  }

  function startNew() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  }

  async function handleSave() {
    setError(null);
    try {
      if (editingId) {
        await window.api.templates.update(editingId, form);
      } else {
        await window.api.templates.add(form);
      }
      setShowForm(false);
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this template?")) return;
    try {
      await window.api.templates.delete(id);
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <>
      <div className="page-header">
        <h1>Prompt Templates</h1>
        <p>Reusable style, safety, and naming rules applied when generating image prompts.</p>
      </div>

      {error && <div className="inline-msg error" style={{ marginBottom: 16 }}>{error}</div>}

      {showForm && (
        <div className="panel">
          <h2>{editingId ? "Edit Template" : "New Template"}</h2>
          <div className="form-row">
            <label>Name</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="form-row">
            <label>Image Style</label>
            <input
              value={form.imageStyle}
              onChange={(e) => setForm({ ...form, imageStyle: e.target.value })}
            />
          </div>
          <div className="form-row">
            <label>Things to Avoid</label>
            <input
              value={form.thingsToAvoid}
              onChange={(e) => setForm({ ...form, thingsToAvoid: e.target.value })}
            />
          </div>
          <div className="form-row">
            <label>Alt Text Rules</label>
            <input
              value={form.altTextRules}
              onChange={(e) => setForm({ ...form, altTextRules: e.target.value })}
            />
          </div>
          <div className="form-row">
            <label>Filename Rules</label>
            <input
              value={form.filenameRules}
              onChange={(e) => setForm({ ...form, filenameRules: e.target.value })}
            />
          </div>
          <div className="form-row">
            <label>Prompt Format</label>
            <input
              value={form.promptFormat}
              onChange={(e) => setForm({ ...form, promptFormat: e.target.value })}
            />
          </div>
          <div className="form-row">
            <label>Default Image Count</label>
            <select
              value={form.defaultImageCount}
              onChange={(e) => setForm({ ...form, defaultImageCount: Number(e.target.value) })}
            >
              <option value={1}>1</option>
              <option value={2}>2</option>
              <option value={3}>3</option>
              <option value={4}>4</option>
            </select>
          </div>
          <div className="btn-row">
            <button className="btn" onClick={handleSave} disabled={!form.name.trim()}>
              Save
            </button>
            <button className="btn secondary" onClick={() => setShowForm(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {!showForm && (
        <div className="btn-row" style={{ marginBottom: 20 }}>
          <button className="btn" onClick={startNew}>
            + New Custom Template
          </button>
        </div>
      )}

      {templates.map((t) => (
        <div className="panel" key={t.id}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <h2 style={{ marginBottom: 4 }}>{t.name}</h2>
              {t.isBuiltin && <span className="badge untested">Built-in</span>}
            </div>
            <div className="btn-row">
              {!t.isBuiltin && (
                <>
                  <button className="btn secondary" onClick={() => startEdit(t)}>
                    Edit
                  </button>
                  <button className="btn danger" onClick={() => handleDelete(t.id)}>
                    Delete
                  </button>
                </>
              )}
            </div>
          </div>
          <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 8 }}>
            <strong>Style:</strong> {t.imageStyle || "—"}
          </p>
          <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
            <strong>Avoid:</strong> {t.thingsToAvoid || "—"}
          </p>
        </div>
      ))}
    </>
  );
}
