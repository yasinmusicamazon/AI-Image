import { useEffect, useState } from "react";
import type { Website, WpContentItem, ContentBackup } from "../../electron/types";

export default function BackupRollbackScreen() {
  const [websites, setWebsites] = useState<Website[]>([]);
  const [selectedWebsiteId, setSelectedWebsiteId] = useState("");
  const [content, setContent] = useState<WpContentItem[]>([]);
  const [selectedContentId, setSelectedContentId] = useState<number | null>(null);
  const [backups, setBackups] = useState<ContentBackup[]>([]);
  const [viewingBackup, setViewingBackup] = useState<ContentBackup | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    window.api.websites.list().then((sites) => {
      setWebsites(sites);
      if (sites.length > 0) setSelectedWebsiteId(sites[0].id);
    });
  }, []);

  useEffect(() => {
    if (!selectedWebsiteId) return;
    window.api.content.list(selectedWebsiteId).then(setContent);
    setSelectedContentId(null);
    setBackups([]);
  }, [selectedWebsiteId]);

  useEffect(() => {
    if (!selectedWebsiteId || !selectedContentId) return;
    window.api.backups.list(selectedWebsiteId, selectedContentId).then(setBackups);
  }, [selectedWebsiteId, selectedContentId]);

  async function handleRollback(backupId: string) {
    if (!confirm("Restore this backup? The current live content will be replaced.")) return;
    const item = content.find((c) => c.id === selectedContentId);
    if (!item) return;
    setBusy(true);
    setError(null);
    try {
      await window.api.backups.rollback(selectedWebsiteId, backupId, item.type);
      setMsg("Rollback complete. The page/post content has been restored.");
      const updated = await window.api.backups.list(selectedWebsiteId, selectedContentId!);
      setBackups(updated);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="page-header">
        <h1>Backup &amp; Rollback</h1>
        <p>Every content update is backed up first. Restore a previous version at any time.</p>
      </div>

      <div className="panel">
        <div className="form-row">
          <label>Website</label>
          <select value={selectedWebsiteId} onChange={(e) => setSelectedWebsiteId(e.target.value)}>
            {websites.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </div>
        <div className="form-row">
          <label>Page/Post</label>
          <select
            value={selectedContentId ?? ""}
            onChange={(e) => setSelectedContentId(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">Select a page/post…</option>
            {content.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title} ({c.type})
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && <div className="inline-msg error">{error}</div>}
      {msg && <div className="inline-msg success">{msg}</div>}

      {selectedContentId && (
        <div className="panel">
          <h2>Backup History</h2>
          {backups.length === 0 ? (
            <div className="empty-state">No backups yet for this page/post.</div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Created</th>
                  <th>Restored</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {backups.map((b) => (
                  <tr key={b.id}>
                    <td>{new Date(b.createdAt).toLocaleString()}</td>
                    <td>{b.restoredAt ? new Date(b.restoredAt).toLocaleString() : "—"}</td>
                    <td>
                      <div className="btn-row">
                        <button className="btn secondary" onClick={() => setViewingBackup(b)}>
                          View
                        </button>
                        <button className="btn danger" onClick={() => handleRollback(b.id)} disabled={busy}>
                          Rollback
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {viewingBackup && (
        <div className="panel">
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <h2>Backup Content — {new Date(viewingBackup.createdAt).toLocaleString()}</h2>
            <button className="btn secondary" onClick={() => setViewingBackup(null)}>
              Close
            </button>
          </div>
          <pre
            style={{
              background: "var(--bg-panel-raised)",
              padding: 14,
              borderRadius: 8,
              fontSize: 11.5,
              maxHeight: 400,
              overflow: "auto",
              whiteSpace: "pre-wrap"
            }}
          >
            {viewingBackup.originalContentRaw}
          </pre>
        </div>
      )}
    </>
  );
}
