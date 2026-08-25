import { Component, type ReactNode } from 'react';
import { reportFailure } from '@reviewies/core/data/failure';

/**
 * Keep one broken screen from taking the app with it.
 *
 * There was no boundary anywhere, on either platform, which means a thrown error in any
 * component unmounted the whole React tree: a blank page, no message, and no way back
 * except reloading — on an app whose entire premise is that your history is safe on this
 * device. The data was always fine and the screen said nothing at all.
 *
 * Around the routes rather than the shell, so the navigation survives and somebody can
 * leave the screen that broke.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error) {
    // Through the same bus as an unhandled rejection, so both are said the same way.
    reportFailure(error);
  }

  /**
   * Recover when the route changes.
   *
   * A boundary that latches forever turns one broken screen into a permanently broken
   * tab. The children change identity on navigation, so this clears on the next render
   * with different children rather than requiring a reload.
   */
  componentDidUpdate(previous: { children: ReactNode }) {
    if (this.state.failed && previous.children !== this.props.children) {
      this.setState({ failed: false });
    }
  }

  render() {
    if (this.state.failed) {
      return (
        <div className="flex flex-col gap-3 p-4">
          <h1 className="text-2xl font-semibold">This screen stopped</h1>
          <p className="text-muted">
            Something on it went wrong. Everything you have tracked is still here — it
            lives on this device and nothing was lost. Try another section below.
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}
