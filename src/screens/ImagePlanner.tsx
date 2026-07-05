import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import type { WpContentItem, PromptTemplate, GlobalSettings } from "../../electron/types";

export default function ImagePlannerScreen() {
  const [searchParams] = useSearchParams();
  const websiteId = searchParams.get("websiteId") || "";
  const contentIds = (searchParams.get("contentIds") || "")
    .split(",")
    .filter(Boolean)
    .map((id) => parseInt(id, 10));

  const [items, setItems] = useState<WpContentItem[]>([]);
  const [templates, setTemplates] = useState<PromptTemplate[]>([]);
  const [provider, setProvider] = useState<"openai" | "gemini">("openai");
  const [imageCount, setImageCount] = useState(2);
  const [templateId, setTemplateId] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!websiteId) return;
    window.api.content.list(websiteId).then((all) => {
      setItems(all.filter((c) => contentIds.includes(c.id)));
    });
    window.api.templates.list().then(setTemplates);
    window.api.settings.getGlobalSettings().then((s: GlobalSettings) => {
      setImageCount(s.defaultImagesPerPage);
      if (s.defaultProvider === "openai" || s.defaultProvider === "gemini") {
        setProvider(s.defaultProvider);
      }
      if (s.activeTemplateId) setTemplateId(s.activeTemplateId);
    });
  }, [websiteId]);

  async function handleStart() {
    if (items.length === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      const template = templates.find((t) => t.id === templateId);
      const jobItems = items.map((item) => ({
        websiteId,
        contentId: item.id,
        contentType: item.type,
        contentTitle: item.title,
        provider,
        imageCount,
        templateStyle: template?.imageStyle ?? "",
        templateAvoid: template?.thingsToAvoid ?? "",
        brandNotes: ""
      }));
      await window.api.jobs.enqueue(jobItems);
      navigate("/jobs");
    } catch (err) {
      setError((err as Error).message || "Failed to start image jobs.");
      setSubmitting(false);
    }
  }

  if (!websiteId || items.length === 0) {
    return (
      <>
        <div className="page-header">
          <h1>AI Image Planner</h1>
        </div>
        <div className="empty-state">
          No content selected. Go to <strong>Content Manager</strong>, select pages/posts, then click
          "Create Image Plan".
        </div>
      </>
    );
  }

  return (
    <>
      <div className="page-header">
        <h1>AI Image Planner</h1>
        <p>Configure how images should be planned and generated for {items.length} selected item(s).</p>
      </div>

      <div className="panel">
        <h2>Selected Content</h2>
        <table className="data-table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Type</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>{item.title}</td>
                <td>{item.type}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="panel">
        <h2>Generation Settings</h2>
        <div className="form-row">
          <label>AI Provider</label>
          <select value={provider} onChange={(e) => setProvider(e.target.value as "openai" | "gemini")}>
            <option value="openai">OpenAI</option>
            <option value="gemini">Gemini</option>
          </select>
        </div>
        <div className="form-row">
          <label>Images per page</label>
          <select value={imageCount} onChange={(e) => setImageCount(Number(e.target.value))}>
            <option value={1}>1</option>
            <option value={2}>2</option>
            <option value={3}>3</option>
            <option value={4}>4</option>
          </select>
        </div>
        <div className="form-row">
          <label>Prompt Template</label>
          <select value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
            <option value="">No template (generic)</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>

        {error && <div className="inline-msg error">{error}</div>}

        <div className="btn-row">
          <button className="btn" onClick={handleStart} disabled={submitting}>
            {submitting ? "Starting…" : `Analyze & Generate for ${items.length} Item(s)`}
          </button>
        </div>
        <p style={{ color: "var(--text-muted)", fontSize: 12, marginTop: 10 }}>
          This creates a background job per page: it analyzes the content, asks the AI for an image
          plan, generates each image, and runs a watermark check. Track progress in the Job Queue.
        </p>
      </div>
    </>
  );
}
