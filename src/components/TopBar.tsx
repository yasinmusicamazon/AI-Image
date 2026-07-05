import { useEffect, useState } from "react";
import type { ApiKeyStatus } from "../lib/window-api";

export default function TopBar() {
  const [openai, setOpenai] = useState<ApiKeyStatus | null>(null);
  const [gemini, setGemini] = useState<ApiKeyStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const status = await window.api.settings.getApiKeyStatus();
      if (!cancelled) {
        setOpenai(status.openai);
        setGemini(status.gemini);
      }
    }
    load();
    const interval = setInterval(load, 8000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  function dotClass(status: ApiKeyStatus | null): string {
    if (!status || !status.configured) return "unknown";
    if (status.lastTestResult === "success") return "ok";
    if (status.lastTestResult === "error") return "error";
    return "unknown";
  }

  return (
    <header className="topbar">
      <div className="topbar-title">WP AI Image Publisher</div>
      <div style={{ display: "flex", gap: 10 }}>
        <span className="status-pill">
          <span className={`status-dot ${dotClass(openai)}`} />
          OpenAI
        </span>
        <span className="status-pill">
          <span className={`status-dot ${dotClass(gemini)}`} />
          Gemini
        </span>
      </div>
    </header>
  );
}
