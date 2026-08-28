import { Component, type ReactNode } from 'react';

/**
 * Keep one broken screen from taking the app with it.
 *
 * There was no boundary anywhere, on either platform, which means a thrown error in any
 * component unmounted the whole React tree: a blank page, no message, and no way back
 * except reloading — on an app whose entire premise is that your history is safe on this
 * device. The data was always fine and the screen said nothing at all.
 *
 * Around the routes rather than the shell, so the navigation survives and somebody can
 * leave the screen that broke — except on the one route that hides it. Watching Mode is
 * immersive and has no tab bar, so breaking it left "Try another section below" pointing
 * at nothing at all. Sweeping every route is what found that; checking two of them had
 * not. The way home is always offered now, which costs a line on the twelve screens that
 * do not need it.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  /**
   * Deliberately does not report into the failure bus.
   *
   * It did, until sweeping every route showed the result: a full-screen explanation
   * with a banner on top of it repeating the same sentence. The bus is what drives that
   * banner — it is a way of telling somebody, not a log — and a failure this component
   * has already explained does not need telling twice.
   */
  componentDidCatch() {}

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
          <h1 className="text-s24 font-title font-semibold">This screen stopped</h1>
          <p className="text-ink-secondary">
            Something on it went wrong. Everything you have tracked is still here — it
            lives on this device and nothing was lost.
          </p>
          <a
            href="/"
            className="self-start rounded-pill bg-action-fill px-5 py-3 font-title font-semibold text-action-label"
          >
            Go to Up Next
          </a>
        </div>
      );
    }
    return this.props.children;
  }
}
