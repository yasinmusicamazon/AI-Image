import { useEffect, useState } from "react";
import type { Website } from "../../electron/types";
import type { WordPressConnectionTestResult } from "../lib/window-api";

export default function WebsiteManagerScreen() {
  const [websites, setWebsites] = useState<Website[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [testResults, setTestResults] = useState<Record<string, WordPressConnectionTestResult>>({});
  const [busy, setBusy] = useState<Record<string, "testing" | "loading" | "deleting" | null>>({});
  const [loadMsg, setLoadMsg] = useState<Record<string, string>>({});
  const [listError, setListError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    setListError(null);
    try {
      if (!window.api?.websites) {
        throw new Error(
          "The app's backend bridge (window.api) is not available. Try restarting the app."
        );
      }
      setWebsites(await window.api.websites.list());
    } catch (err) {
      setListError((err as Error).message || "Failed to load websites.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function handleTest(id: string) {
    setBusy((b) => ({ ...b, [id]: "testing" }));
    try {
      const result = await window.api.websites.testConnection(id);
      setTestResults((r) => ({ ...r, [id]: result }));
    } finally {
      setBusy((b) => ({ ...b, [id]: null }));
      await refresh();
    }
  }

  async function handleLoadContent(id: string) {
    setBusy((b) => ({ ...b, [id]: "loading" }));
    try {
      const res = await window.api.websites.loadContent(id);
      setLoadMsg((m) => ({ ...m, [id]: `Loaded ${res.count} pages/posts.` }));
    } catch (err) {
      setLoadMsg((m) => ({ ...m, [id]: `Failed to load content: ${(err as Error).message}` }));
    } finally {
      setBusy((b) => ({ ...b, [id]: null }));
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Remove this website from the app? This also deletes its stored credentials.")) {
      return;
    }
    setBusy((b) => ({ ...b, [id]: "deleting" }));
    try {
      await window.api.websites.delete(id);
      await refresh();
    } finally {
      setBusy((b) => ({ ...b, [id]: null }));
    }
  }

  return (
    <>
      <div className="page-header">
        <h1>Website Manager</h1>
        <p>Connect WordPress sites using Application Passwords, then load their pages/posts.</p>
      </div>

      {listError && (
        <div className="panel">
          <div className="inline-msg error">{listError}</div>
          <div className="btn-row" style={{ marginTop: 12 }}>
            <button className="btn" onClick={refresh}>
              Retry
            </button>
          </div>
        </div>
      )}

      {showAddForm ? (
        <AddWebsiteForm
          onCancel={() => setShowAddForm(false)}
          onAdded={async () => {
            setShowAddForm(false);
            await refresh();
          }}
        />
      ) : (
        <div className="btn-row" style={{ marginBottom: 20 }}>
          <button className="btn" onClick={() => setShowAddForm(true)}>
            + Add Website
          </button>
        </div>
      )}

      {loading ? (
        <div className="empty-state">Loading websites…</div>
      ) : websites.length === 0 ? (
        !listError && <div className="empty-state">No websites added yet.</div>
      ) : (
        websites.map((site) => (
          <div className="panel" key={site.id}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <h2 style={{ marginBottom: 4 }}>{site.name}</h2>
                <div style={{ color: "var(--text-muted)", fontSize: 12.5 }}>{site.siteUrl}</div>
              </div>
              <span className={`badge ${site.connectionStatus}`}>{site.connectionStatus}</span>
            </div>

            <div className="btn-row" style={{ marginTop: 14 }}>
              <button
                className="btn secondary"
                onClick={() => handleTest(site.id)}
                disabled={busy[site.id] === "testing"}
              >
                {busy[site.id] === "testing" ? "Testing…" : "Test WordPress Connection"}
              </button>
              <button
                className="btn secondary"
                onClick={() => handleLoadContent(site.id)}
                disabled={busy[site.id] === "loading"}
              >
                {busy[site.id] === "loading" ? "Loading…" : "Load Pages/Posts"}
              </button>
              <button className="btn secondary" onClick={refresh}>
                Refresh
              </button>
              <button
                className="btn danger"
                onClick={() => handleDelete(site.id)}
                disabled={busy[site.id] === "deleting"}
              >
                Delete
              </button>
            </div>

            {loadMsg[site.id] && <div className="inline-msg success">{loadMsg[site.id]}</div>}

            {testResults[site.id] && <ConnectionTestDetails result={testResults[site.id]} />}
          </div>
        ))
      )}
    </>
  );
}

function ConnectionTestDetails({ result }: { result: WordPressConnectionTestResult }) {
  const steps: Array<[string, boolean]> = [
    ["REST API reachable", result.steps.restApiReachable],
    ["Authentication valid", result.steps.authenticationValid],
    ["Can read pages/posts", result.steps.canReadContent],
    ["Can upload media", result.steps.canUploadMedia],
    ["Can update pages/posts", result.steps.canUpdateContent]
  ];

  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8 }}>
        {steps.map(([label, ok]) => (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
            <span className={`status-dot ${ok ? "ok" : "error"}`} />
            {label}
          </div>
        ))}
      </div>
      {result.errors.length > 0 && (
        <div className="inline-msg error" style={{ marginTop: 10 }}>
          {result.errors.map((e, i) => (
            <div key={i}>{e}</div>
          ))}
        </div>
      )}
    </div>
  );
}

function AddWebsiteForm({ onCancel, onAdded }: { onCancel: () => void; onAdded: () => void }) {
  const [name, setName] = useState("");
  const [siteUrl, setSiteUrl] = useState("");
  const [username, setUsername] = useState("");
  const [appPassword, setAppPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim() || !siteUrl.trim() || !username.trim() || !appPassword.trim()) {
      setError("All fields are required.");
      return;
    }
    setSaving(true);
    try {
      await window.api.websites.add({
        name: name.trim(),
        siteUrl: siteUrl.trim(),
        username: username.trim(),
        applicationPassword: appPassword.trim()
      });
      onAdded();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="panel" onSubmit={handleSubmit}>
      <h2>Add WordPress Website</h2>
      <div className="form-row">
        <label>Site Name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Dual Diagnosis Treatment Guide" />
      </div>
      <div className="form-row">
        <label>Site URL</label>
        <input
          value={siteUrl}
          onChange={(e) => setSiteUrl(e.target.value)}
          placeholder="https://dualdiagnosistreatmentguide.com"
        />
      </div>
      <div className="form-row">
        <label>WordPress Username</label>
        <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="admin" />
      </div>
      <div className="form-row">
        <label>Application Password</label>
        <input
          type="password"
          value={appPassword}
          onChange={(e) => setAppPassword(e.target.value)}
          placeholder="xxxx xxxx xxxx xxxx xxxx xxxx"
        />
        <span style={{ color: "var(--text-muted)", fontSize: 12 }}>
          Generate this under WordPress Admin → Users → Profile → Application Passwords. It is
          stored only in your OS keychain, never in plain text.
        </span>
      </div>
      {error && <div className="inline-msg error">{error}</div>}
      <div className="btn-row">
        <button type="submit" className="btn" disabled={saving}>
          {saving ? "Saving…" : "Add Website"}
        </button>
        <button type="button" className="btn secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
