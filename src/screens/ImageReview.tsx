import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { GeneratedImage } from "../../electron/types";

export default function ImageReviewScreen() {
  const [searchParams] = useSearchParams();
  const websiteId = searchParams.get("websiteId") || "";
  const contentId = parseInt(searchParams.get("contentId") || "0", 10);

  const [images, setImages] = useState<GeneratedImage[]>([]);
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<Record<string, string | null>>({});
  const [editingPrompt, setEditingPrompt] = useState<Record<string, string>>({});
  const [contentType, setContentType] = useState<"page" | "post">("page");
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    try {
      const list = await window.api.planner.listImages(websiteId, contentId);
      setImages(list);

      const items = await window.api.content.list(websiteId);
      const match = items.find((i) => i.id === contentId);
      if (match) setContentType(match.type);

      for (const img of list) {
        const path = img.processedPath || img.localPath;
        if (path && !thumbnails[img.id]) {
          try {
            const result = await window.api.images.readImageFile(path);
            setThumbnails((prev) => ({ ...prev, [img.id]: result.dataUrl }));
          } catch {
            // Thumbnail unavailable; the row still renders with status text.
          }
        }
      }
    } catch (err) {
      setError((err as Error).message || "Failed to load images.");
    }
  }

  useEffect(() => {
    if (websiteId && contentId) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [websiteId, contentId]);

  async function handleApprove(imageId: string) {
    setBusy((b) => ({ ...b, [imageId]: "approving" }));
    try {
      await window.api.images.approve(websiteId, imageId);
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy((b) => ({ ...b, [imageId]: null }));
    }
  }

  async function handleUploadAndInsert(imageId: string) {
    setBusy((b) => ({ ...b, [imageId]: "inserting" }));
    try {
      const result = await window.api.images.uploadAndInsert(websiteId, imageId, contentType);
      if (!result.inserted) {
        setError(result.note);
      }
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy((b) => ({ ...b, [imageId]: null }));
    }
  }

  async function handleSkip(imageId: string) {
    await window.api.images.skip(imageId);
    await refresh();
  }

  async function handleRegenerate(imageId: string, provider: "openai" | "gemini") {
    setBusy((b) => ({ ...b, [imageId]: "regenerating" }));
    try {
      await window.api.images.regenerate(imageId, provider, editingPrompt[imageId]);
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy((b) => ({ ...b, [imageId]: null }));
    }
  }

  if (!websiteId || !contentId) {
    return (
      <>
        <div className="page-header">
          <h1>Image Review</h1>
        </div>
        <div className="empty-state">
          Open this from the Job Queue's "Review Images" button after a job completes.
        </div>
      </>
    );
  }

  return (
    <>
      <div className="page-header">
        <h1>Image Review</h1>
        <p>Preview, approve, regenerate, or skip each planned image.</p>
      </div>

      {error && <div className="inline-msg error" style={{ marginBottom: 16 }}>{error}</div>}

      {images.length === 0 ? (
        <div className="empty-state">No images planned for this content yet.</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 16 }}>
          {images.map((img) => (
            <div className="panel" key={img.id}>
              <div
                style={{
                  width: "100%",
                  aspectRatio: "4 / 3",
                  background: "var(--bg-panel-raised)",
                  borderRadius: 8,
                  overflow: "hidden",
                  marginBottom: 12,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center"
                }}
              >
                {thumbnails[img.id] ? (
                  <img
                    src={thumbnails[img.id]}
                    alt={img.altText}
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                ) : (
                  <span style={{ color: "var(--text-muted)", fontSize: 12 }}>
                    {img.status === "planned" ? "Not generated yet" : "No preview"}
                  </span>
                )}
              </div>

              <div style={{ fontSize: 13, marginBottom: 6 }}>
                <strong>{img.imageType.replace("_", " ")}</strong>
                <span className={`badge ${img.watermarkFlag ? "error" : "untested"}`} style={{ marginLeft: 8 }}>
                  {img.status}
                </span>
              </div>
              <div style={{ color: "var(--text-muted)", fontSize: 12, marginBottom: 8 }}>{img.fileName}</div>

              {img.watermarkFlag && (
                <div className="inline-msg error" style={{ marginBottom: 10 }}>
                  Watermark flagged: {img.watermarkReason}
                </div>
              )}

              <textarea
                value={editingPrompt[img.id] ?? img.prompt}
                onChange={(e) => setEditingPrompt((p) => ({ ...p, [img.id]: e.target.value }))}
                rows={3}
                style={{
                  width: "100%",
                  background: "var(--bg-panel-raised)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  color: "var(--text)",
                  padding: 8,
                  fontSize: 12,
                  marginBottom: 10,
                  resize: "vertical"
                }}
              />

              <div className="btn-row">
                {(img.status === "generated" || img.status === "watermark_flagged") && !img.watermarkFlag && (
                  <button
                    className="btn secondary"
                    onClick={() => handleApprove(img.id)}
                    disabled={!!busy[img.id]}
                  >
                    {busy[img.id] === "approving" ? "Processing…" : "Approve"}
                  </button>
                )}
                {(img.status === "processed" || img.status === "uploaded") && (
                  <button
                    className="btn"
                    onClick={() => handleUploadAndInsert(img.id)}
                    disabled={!!busy[img.id]}
                  >
                    {busy[img.id] === "inserting" ? "Inserting…" : "Insert into Page"}
                  </button>
                )}
                <button
                  className="btn secondary"
                  onClick={() => handleRegenerate(img.id, img.provider === "gemini" ? "gemini" : "openai")}
                  disabled={!!busy[img.id]}
                >
                  {busy[img.id] === "regenerating" ? "Regenerating…" : "Regenerate"}
                </button>
                <button className="btn danger" onClick={() => handleSkip(img.id)} disabled={!!busy[img.id]}>
                  Skip
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
