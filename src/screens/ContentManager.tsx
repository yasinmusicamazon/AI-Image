import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Website } from "../../electron/types";
import type { WpContentItem } from "../../electron/types";

export default function ContentManagerScreen() {
  const [websites, setWebsites] = useState<Website[]>([]);
  const [selectedWebsiteId, setSelectedWebsiteId] = useState<string>("");
  const [content, setContent] = useState<WpContentItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    window.api.websites.list().then((sites) => {
      setWebsites(sites);
      if (sites.length > 0) setSelectedWebsiteId(sites[0].id);
    });
  }, []);

  useEffect(() => {
    if (!selectedWebsiteId) return;
    refreshContent();
  }, [selectedWebsiteId]);

  async function refreshContent() {
    setLoading(true);
    setError(null);
    try {
      const items = await window.api.content.list(selectedWebsiteId);
      setContent(items);
      setSelectedIds(new Set());
    } catch (err) {
      setError((err as Error).message || "Failed to load content.");
    } finally {
      setLoading(false);
    }
  }

  async function handleLoadFromWordPress() {
    setLoading(true);
    setError(null);
    try {
      await window.api.websites.loadContent(selectedWebsiteId);
      await refreshContent();
    } catch (err) {
      setError((err as Error).message || "Failed to load pages/posts from WordPress.");
      setLoading(false);
    }
  }

  const filtered = content.filter((item) => {
    if (statusFilter !== "all" && item.status !== statusFilter) return false;
    if (typeFilter !== "all" && item.type !== typeFilter) return false;
    if (search.trim() && !item.title.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  function toggleSelect(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((c) => c.id)));
    }
  }

  function handleCreateImageJobs() {
    if (selectedIds.size === 0) return;
    const ids = Array.from(selectedIds).join(",");
    navigate(`/image-planner?websiteId=${selectedWebsiteId}&contentIds=${ids}`);
  }

  const statuses = Array.from(new Set(content.map((c) => c.status)));

  return (
    <>
      <div className="page-header">
        <h1>Content Manager</h1>
        <p>Select a website, load its pages/posts, and choose which ones to create AI images for.</p>
      </div>

      {websites.length === 0 ? (
        <div className="empty-state">
          No websites connected yet. Add one in <strong>Website Manager</strong> first.
        </div>
      ) : (
        <>
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
            <div className="btn-row">
              <button className="btn secondary" onClick={handleLoadFromWordPress} disabled={loading}>
                {loading ? "Loading…" : "Load Pages/Posts from WordPress"}
              </button>
              <button className="btn secondary" onClick={refreshContent} disabled={loading}>
                Refresh List
              </button>
            </div>
            {error && <div className="inline-msg error">{error}</div>}
          </div>

          <div className="panel">
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
              <input
                style={{ flex: 1, minWidth: 200 }}
                placeholder="Search by title…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} style={{ width: 140 }}>
                <option value="all">All types</option>
                <option value="page">Pages</option>
                <option value="post">Posts</option>
              </select>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ width: 160 }}>
                <option value="all">All statuses</option>
                {statuses.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            {/* Sticky selection bar: visible the instant something is
                checked, regardless of how far down the list you scroll.
                With unpaginated lists of 50+ items, a call-to-action only
                at the bottom of the table was effectively invisible. */}
            {selectedIds.size > 0 && (
              <div
                style={{
                  position: "sticky",
                  top: 0,
                  zIndex: 5,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  background: "var(--accent)",
                  color: "white",
                  borderRadius: 8,
                  padding: "12px 16px",
                  marginBottom: 14
                }}
              >
                <span style={{ fontSize: 13.5, fontWeight: 500 }}>
                  {selectedIds.size} item{selectedIds.size === 1 ? "" : "s"} selected
                </span>
                <div className="btn-row">
                  <button
                    className="btn secondary"
                    style={{ background: "rgba(255,255,255,0.15)", color: "white", border: "none" }}
                    onClick={() => setSelectedIds(new Set())}
                  >
                    Clear
                  </button>
                  <button
                    className="btn"
                    style={{ background: "white", color: "var(--accent)" }}
                    onClick={handleCreateImageJobs}
                  >
                    Add / Update Images for {selectedIds.size} Page{selectedIds.size === 1 ? "" : "s"} →
                  </button>
                </div>
              </div>
            )}

            {filtered.length === 0 ? (
              <div className="empty-state">
                {content.length === 0
                  ? "No content loaded yet. Click \"Load Pages/Posts from WordPress\" above."
                  : "No items match your search/filter."}
              </div>
            ) : (
              <>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>
                        <input
                          type="checkbox"
                          checked={selectedIds.size === filtered.length && filtered.length > 0}
                          onChange={toggleSelectAll}
                        />
                      </th>
                      <th>Title</th>
                      <th>Type</th>
                      <th>Status</th>
                      <th>Modified</th>
                      <th>Featured Image</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((item) => (
                      <tr key={`${item.type}-${item.id}`}>
                        <td>
                          <input
                            type="checkbox"
                            checked={selectedIds.has(item.id)}
                            onChange={() => toggleSelect(item.id)}
                          />
                        </td>
                        <td>{item.title}</td>
                        <td>{item.type}</td>
                        <td>{item.status}</td>
                        <td>{new Date(item.modifiedAt).toLocaleDateString()}</td>
                        <td>{item.featuredImageId ? "Yes" : "—"}</td>
                        <td>
                          <button
                            className="btn secondary"
                            style={{ padding: "5px 10px", fontSize: 12 }}
                            onClick={() =>
                              navigate(`/image-planner?websiteId=${selectedWebsiteId}&contentIds=${item.id}`)
                            }
                          >
                            Add Images
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div className="btn-row" style={{ marginTop: 16 }}>
                  <button className="btn" onClick={handleCreateImageJobs} disabled={selectedIds.size === 0}>
                    Add / Update Images for {selectedIds.size || ""} Selected
                  </button>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </>
  );
}
