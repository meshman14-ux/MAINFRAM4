/* ErrorBoundary — audit C3. Without this, any render-time throw in a page
   unmounted the whole app to a blank white screen. This catches it, shows a
   recoverable fallback, and keeps the rest of the shell (nav) alive. */
import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props { children: ReactNode }
interface State { error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Surfaced to the dev console; the user sees the fallback below.
    console.error('[MAINFRAME] render error:', error, info.componentStack);
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="p4">
          <div className="empty-state" style={{ maxWidth: 520, margin: '48px auto', padding: 32 }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--ink)', marginBottom: 8 }}>Something went wrong on this screen</div>
            <p className="muted" style={{ fontSize: 13.5, lineHeight: 1.6, marginBottom: 18 }}>
              The page hit an unexpected error. Your data is safe — nothing was
              changed. Try again, or head back to Home.
            </p>
            <div className="row-inline" style={{ justifyContent: 'center' }}>
              <button className="btn btn-primary" onClick={() => this.setState({ error: null })}>Try again</button>
              <a className="btn btn-ghost" href="#/" onClick={() => this.setState({ error: null })}>Go to Home</a>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
