import { useEffect, useState } from "react";
import type { DashboardSummary } from "../lib/window-api";

export default function Dashboard() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const data = await window.api.dashboard.getSummary();
      if (!cancelled) setSummary(data);
    }
    load();
    const interval = setInterval(load, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return (
    <>
      <div className="page-header">
        <h1>Dashboard</h1>
        <p>Overview of connected sites, content, and image job activity.</p>
      </div>

      <div className="card-grid">
        <StatCard label="Connected Websites" value={summary?.totalWebsites ?? "–"} />
        <StatCard label="Pages/Posts Loaded" value={summary?.totalContentLoaded ?? "–"} />
        <StatCard label="Pending Jobs" value={summary?.pendingJobs ?? "–"} />
        <StatCard label="Completed Jobs" value={summary?.completedJobs ?? "–"} />
        <StatCard label="Failed Jobs" value={summary?.failedJobs ?? "–"} />
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
