import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Logged to the renderer devtools console (View > Toggle Developer
    // Tools is always available, even in the packaged app) so a crash
    // can be diagnosed without rebuilding from source.
    console.error("Renderer crashed:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 32 }}>
          <div className="panel">
            <h2>Something went wrong</h2>
            <div className="inline-msg error">{this.state.error.message}</div>
            <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 12 }}>
              Open <strong>View → Toggle Developer Tools</strong> from the menu bar for full
              details, or restart the app.
            </p>
            <div className="btn-row" style={{ marginTop: 12 }}>
              <button className="btn" onClick={() => this.setState({ error: null })}>
                Try Again
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
