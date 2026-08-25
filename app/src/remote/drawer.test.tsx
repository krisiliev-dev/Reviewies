import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setConfig } from '@reviewies/core/config';
import { RemoteDrawer } from './RemoteDrawer';

/**
 * The drawer, driven by a keyboard.
 *
 * The end-to-end suite cannot reach this one: with no relay configured the drawer
 * correctly refuses to render at all, and configuring one there would mean a second
 * build. So the keyboard contract is asserted here instead, where the configuration is
 * a function call.
 *
 * What is being checked is the part that was wrong. The drawer stays mounted while
 * closed — tearing down the connection to the bridge each time would be worse — and it
 * hid itself with `aria-hidden`, which takes it out of the reading order and leaves a
 * dozen buttons sitting in the tab order off the right-hand edge of the screen.
 */
beforeEach(() => {
  setConfig({ bridgeRelay: 'wss://relay.example', bridgeToken: 'token' });
  // The drawer opens a socket to the relay on mount. Nothing here is about the socket.
  vi.stubGlobal(
    'WebSocket',
    class {
      close() {}
      send() {}
      addEventListener() {}
      removeEventListener() {}
    },
  );
});

describe('the remote drawer', () => {
  it('is out of the tab order while closed', () => {
    render(<RemoteDrawer />);
    const drawer = screen.getByRole('dialog', { hidden: true });
    expect(drawer.hasAttribute('inert')).toBe(true);
  });

  it('takes focus when it opens, gives it back when it closes', async () => {
    const user = userEvent.setup();
    render(<RemoteDrawer />);

    const tab = screen.getByRole('button', { name: 'Open remote' });
    tab.focus();
    await user.click(tab);

    const drawer = screen.getByRole('dialog');
    expect(drawer.hasAttribute('inert')).toBe(false);
    await waitFor(() => expect(drawer.contains(document.activeElement)).toBe(true));

    await user.keyboard('{Escape}');

    // Focus goes back to the thing that opened it, not to the top of the document.
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Open remote' })).toHaveFocus(),
    );
  });

  it('takes the tab that opened it out of the way while it is open', async () => {
    const user = userEvent.setup();
    render(<RemoteDrawer />);

    const tab = screen.getByRole('button', { name: 'Open remote' });
    await user.click(tab);

    expect(screen.getByRole('dialog').hasAttribute('inert')).toBe(false);
    // The handle sits underneath the open drawer. Reachable, it would be a control
    // behind a modal that reopens what is already open.
    expect(tab.hasAttribute('inert')).toBe(true);
  });

  // The Tab cycle itself is asserted in app/smoke.mjs against a real browser, on the
  // catch-up sheet, which shares this hook. It cannot be checked here: userEvent's
  // `tab()` moves focus itself rather than letting the page handle the keystroke, so
  // it walks straight through a preventDefault the browser respects.
});
