import { Component, type ErrorInfo, type ReactNode } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Mascot } from "./Mascot";
import { buildReportIssueUrl } from "../lib/reportIssue";

// React error boundaries only catch render/lifecycle errors thrown by
// components *below* them in the tree — a class component is required
// because there is still no hook equivalent (getDerivedStateFromError
// / componentDidCatch have no functional-component form). Without
// this, any uncaught render error anywhere in the app (a malformed
// provider response, a bad date, whatever) unmounts the whole React
// tree and leaves a blank window — for a desktop app with no browser
// chrome to reload from, that's a dead end, not just an ugly error.
// This wraps <App/> in main.tsx so a crash anywhere still leaves the
// user with something clickable instead of a blank titlebar.
interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Never sent anywhere automatically (matches the app's "opt-in
    // analytics, nothing leaves the machine unless asked" stance) —
    // console only, plus the "Report this" button below builds the
    // same pre-filled GitHub issue link the rest of the app uses.
    console.error("Unhandled error caught by ErrorBoundary:", error, info.componentStack);
  }

  private reset = () => {
    this.setState({ error: null });
  };

  private async reportIssue() {
    openUrl(await buildReportIssueUrl());
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <main className="container">
        <div className="crash-state">
          <Mascot />
          <h1>Something went wrong</h1>
          <p className="crash-state-message">
            The app hit an unexpected error and couldn't keep going. Nothing was sent anywhere —
            the details are in this window's console, and you can attach them to a bug report
            below.
          </p>
          <pre className="crash-state-detail">{error.message}</pre>
          <div className="crash-state-actions">
            <button onClick={this.reset}>Try again</button>
            <button className="report-issue-button" onClick={() => this.reportIssue()}>
              Report this
            </button>
          </div>
        </div>
      </main>
    );
  }
}
