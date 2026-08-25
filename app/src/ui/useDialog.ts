import { useEffect, useRef } from 'react';

/**
 * The keyboard half of a modal overlay.
 *
 * Naming a control does not mean anyone can reach it. Both overlays in this app were
 * openable, readable and correctly labelled, and neither moved focus into itself, kept
 * focus inside while it was up, or gave focus back to the button that opened it. On a
 * phone that is invisible; on a keyboard it means opening a sheet and then tabbing
 * through the eighteen episode rows behind it looking for the way out.
 *
 * Three obligations, which is the whole of what a dialog owes a keyboard:
 *
 *   - focus lands inside on open, so the next Tab is somewhere useful;
 *   - Tab and Shift+Tab cycle within, so nothing behind is reachable while it is up;
 *   - Escape closes, and focus returns to whatever opened it.
 *
 * Returns a ref for the dialog element, which needs `tabIndex={-1}` so it can hold
 * focus itself when it contains nothing focusable yet.
 *
 * `active` exists because one of the two overlays stays mounted while closed — the
 * remote keeps its connection to the bridge across open and shut — so mounting is not
 * the signal. While it is closed it should also be `inert`, which takes it out of the
 * tab order as well as out of the reading order; `aria-hidden` alone leaves a dozen
 * focusable buttons sitting behind the page.
 */
const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export function useDialog<T extends HTMLElement>(active: boolean, onClose: () => void) {
  const ref = useRef<T>(null);
  // Held in a ref so a caller passing an inline arrow — which every caller does —
  // does not re-run the effect on each render and yank focus back to the top.
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    const node = ref.current;
    if (!active || !node) return;

    const opener = document.activeElement as HTMLElement | null;
    const inside = () => [...node.querySelectorAll<HTMLElement>(FOCUSABLE)];
    (inside()[0] ?? node).focus();

    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        // Captured before anything else can act on it: a drawer opened over this one
        // would otherwise close both at once.
        event.stopPropagation();
        close.current();
        return;
      }
      if (event.key !== 'Tab' || !node) return;

      const items = inside();
      if (items.length === 0) {
        event.preventDefault();
        node.focus();
        return;
      }

      const [first] = items;
      const last = items[items.length - 1];
      const active = document.activeElement;

      if (!node.contains(active)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      // Only if it is still on the page. Catching up completes by removing the very row
      // whose button opened the sheet, and focusing a detached node silently drops
      // focus to the body — worse than leaving it where the browser puts it.
      if (opener && document.contains(opener)) opener.focus();
    };
  }, [active]);

  return ref;
}
