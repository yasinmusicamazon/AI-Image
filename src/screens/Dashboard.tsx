import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { DashboardSummary } from "../lib/window-api";
import type { Job } from "../../electron/types";

export default function Dashboard() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [recentJobs, setRecentJobs] = useState<Job[]>([]);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  async function load() {
    try {
      if (!window.api?.dashboard) {
        throw new Error(
          "The app's backend bridge (window.api) is not available. Try restarting the app."
        );
      }
      const [data, jobs] = await Promise.all([window.api.dashboard.getSummary(), window.api.jobs.list()]);
      setSummary(data);
      setRecentJobs(jobs.slice(0, 5));
      setError(null);
    } catch (err) {
      setError((err as Error).message || "Failed to load dashboard data.");
    }
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, []);

  if (error) {
    return (
      <>
        <div className="page-header">
          <h1>Dashboard</h1>
        </div>
        <div className="panel">
          <div className="inline-msg error">{error}</div>
          <div className="btn-row" style={{ marginTop: 12 }}>
            <button className="btn" onClick={load}>
              Retry
            </button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="page-header">
        <h1>Dashboard</h1>
        <p>Overview of connected sites, content, and image job activity.</p>
      </div>

      <div className="btn-row" style={{ marginBottom: 20 }}>
        <button className="btn" onClick={() => navigate("/websites")}>
          + Add Website
        </button>
        <button className="btn secondary" onClick={() => navigate("/api-settings")}>
          API Settings
        </button>
        <button className="btn secondary" onClick={() => navigate("/websites")}>
          Load Content
        </button>
        <button className="btn secondary" onClick={() => navigate("/content")}>
          Create Image Job
        </button>
      </div>

      <div className="card-grid">
        <StatCard label="Connected Websites" value={summary?.totalWebsites ?? "–"} />
        <StatCard label="Pages/Posts Loaded" value={summary?.totalContentLoaded ?? "–"} />
        <StatCard label="Pending Jobs" value={summary?.pendingJobs ?? "–"} />
        <StatCard label="Completed Jobs" value={summary?.completedJobs ?? "–"} />
        <StatCard label="Failed Jobs" value={summary?.failedJobs ?? "–"} />
      </div>

      <div className="btn-row" style={{ marginBottom: 20 }}>
        <button className="btn secondary" onClick={() => navigate("/jobs")}>
          View Job Queue
        </button>
      </div>

      <div className="panel">
        <h2>AI Provider Status</h2>
        <div className="card-grid">
          <ProviderStatusCard
            name="OpenAI"
            configured={summary?.openaiStatus.configured}
            result={summary?.openaiStatus.lastTestResult ?? null}
            message={summary?.openaiStatus.lastTestMessage ?? null}
          />
          <ProviderStatusCard
            name="Gemini"
            configured={summary?.geminiStatus.configured}
            result={summary?.geminiStatus.lastTestResult ?? null}
            message={summary?.geminiStatus.lastTestMessage ?? null}
          />
        </div>
      </div>

      <div className="panel">
        <h2>Latest Activity</h2>
        {recentJobs.length === 0 ? (
          <div className="empty-state" style={{ padding: "20px 0" }}>
            No job activity yet. Select pages in Content Manager and create an image plan to get
            started.
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Content</th>
                <th>Provider</th>
                <th>Status</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {recentJobs.map((job) => (
                <tr key={job.id} style={{ cursor: "pointer" }} onClick={() => navigate("/jobs")}>
                  <td>{job.contentTitle || `Content #${job.contentId}`}</td>
                  <td>{job.provider}</td>
                  <td>{job.status}</td>
                  <td>{new Date(job.updatedAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {summary && summary.totalWebsites === 0 && (
        <div className="empty-state">
          No websites connected yet. Head to <strong>Website Manager</strong> to add your first
          WordPress site.
        </div>
      )}
    </>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="card">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
    </div>
  );
}

function ProviderStatusCard({
  name,
  configured,
  result,
  message
}: {
  name: string;
  configured?: boolean;
  result: "success" | "error" | null;
  message: string | null;
}) {
  let statusText = "Not configured";
  let dotClass = "unknown";
  if (configured) {
    if (result === "success") {
      statusText = "Working";
      dotClass = "ok";
    } else if (result === "error") {
      statusText = "Error";
      dotClass = "error";
    } else {
      statusText = "Configured (untested)";
    }
  }

  return (
    <div className="card">
      <div className="label">{name}</div>
      <div className="value" style={{ fontSize: 16, display: "flex", alignItems: "center", gap: 8 }}>
        <span className={`status-dot ${dotClass}`} />
        {statusText}
      </div>
      {message && <div style={{ color: "var(--text-muted)", fontSize: 12, marginTop: 6 }}>{message}</div>}
    </div>
  );
}
