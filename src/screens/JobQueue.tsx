import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Job } from "../../electron/types";

export default function JobQueueScreen() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [paused, setPaused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const list = await window.api.jobs.list();
        if (!cancelled) setJobs(list);
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      }
    }
    load();

    const unsubscribe = window.api.jobs.onUpdate((updatedJob) => {
      setJobs((prev) => {
        const idx = prev.findIndex((j) => j.id === updatedJob.id);
        if (idx === -1) return [updatedJob, ...prev];
        const next = [...prev];
        next[idx] = updatedJob;
        return next;
      });
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handlePauseResume() {
    if (paused) {
      await window.api.jobs.resumeQueue();
      setPaused(false);
    } else {
      await window.api.jobs.pauseQueue();
      setPaused(true);
    }
  }

  async function handleRetry(jobId: string) {
    await window.api.jobs.retry(jobId);
  }

  async function handleCancel(jobId: string) {
    await window.api.jobs.cancel(jobId);
  }

  function statusBadgeClass(status: string): string {
    if (status === "completed") return "connected";
    if (status === "failed" || status === "canceled") return "error";
    return "checking";
  }

  const failedJobs = jobs.filter((j) => j.status === "failed");

  return (
    <>
      <div className="page-header">
        <h1>Job Queue</h1>
        <p>Track background image analysis and generation jobs.</p>
      </div>

      <div className="btn-row" style={{ marginBottom: 20 }}>
        <button className="btn secondary" onClick={handlePauseResume}>
          {paused ? "Resume Queue" : "Pause Queue"}
        </button>
        {failedJobs.length > 0 && (
          <button
            className="btn secondary"
            onClick={() => failedJobs.forEach((j) => handleRetry(j.id))}
          >
            Retry All Failed ({failedJobs.length})
          </button>
        )}
      </div>

      {error && <div className="inline-msg error">{error}</div>}

      {jobs.length === 0 ? (
        <div className="empty-state">
          No jobs yet. Go to <strong>Content Manager</strong> to select pages and create an image
          plan.
        </div>
      ) : (
        jobs.map((job) => (
          <div className="panel" key={job.id}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <strong>{job.contentTitle || `Content #${job.contentId}`}</strong>
                <div style={{ color: "var(--text-muted)", fontSize: 12 }}>
                  Provider: {job.provider} · Updated {new Date(job.updatedAt).toLocaleTimeString()}
                </div>
              </div>
              <span className={`badge ${statusBadgeClass(job.status)}`}>{job.status}</span>
            </div>

            <div
              style={{
                marginTop: 12,
                height: 6,
                borderRadius: 3,
                background: "var(--bg-panel-raised)",
                overflow: "hidden"
              }}
            >
              <div
                style={{
                  width: `${job.progress}%`,
                  height: "100%",
                  background: job.status === "failed" ? "var(--danger)" : "var(--accent)",
                  transition: "width 0.3s ease"
                }}
              />
            </div>

            {job.errorMessage && <div className="inline-msg error" style={{ marginTop: 10 }}>{job.errorMessage}</div>}

            <div className="btn-row" style={{ marginTop: 12 }}>
              <button className="btn secondary" onClick={() => toggleExpanded(job.id)}>
                {expanded.has(job.id) ? "Hide Logs" : "View Logs"}
              </button>
              {job.status === "completed" && (
                <button
                  className="btn secondary"
                  onClick={() =>
                    navigate(`/image-review?websiteId=${job.websiteId}&contentId=${job.contentId}`)
                  }
                >
                  Review Images
                </button>
              )}
              {job.status === "failed" && (
                <button className="btn secondary" onClick={() => handleRetry(job.id)}>
                  Retry
                </button>
              )}
              {(job.status === "pending" || job.status === "analyzing" || job.status === "generating") && (
                <button className="btn danger" onClick={() => handleCancel(job.id)}>
                  Cancel
                </button>
              )}
            </div>

            {expanded.has(job.id) && (
              <div
                style={{
                  marginTop: 12,
                  background: "var(--bg-panel-raised)",
                  borderRadius: 8,
                  padding: 12,
                  fontSize: 12.5,
                  fontFamily: "monospace",
                  maxHeight: 220,
                  overflowY: "auto"
                }}
              >
                {job.logs.length === 0 ? (
                  <div style={{ color: "var(--text-muted)" }}>No logs yet.</div>
                ) : (
                  job.logs.map((log, i) => (
                    <div key={i} style={{ marginBottom: 4 }}>
                      <span style={{ color: "var(--text-muted)" }}>
                        [{new Date(log.timestamp).toLocaleTimeString()}]
                      </span>{" "}
                      {log.message}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        ))
      )}
    </>
  );
}
