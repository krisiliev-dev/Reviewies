/**
 * A way to break a screen on purpose, matching the web's.
 *
 * See `app/src/ui/breakScreen.ts` for why this ships. On the phone it reads the URL on
 * the web export and does nothing on a device, where there is no query string — which
 * is a real limit and is why the phone half of this sweep only covers the export.
 */
export type BreakKind = 'render' | 'effect';

export function breakRequested(): BreakKind | undefined {
  const search = (globalThis as { location?: { search?: string } }).location?.search;
  if (!search) return undefined;
  const value = new URLSearchParams(search).get('break');
  return value === 'render' || value === 'effect' ? value : undefined;
}

export function breakOnRender(screen: string): void {
  if (breakRequested() === 'render') {
    throw new Error(`${screen} was broken on purpose (?break=render)`);
  }
}

export function breakInEffect(screen: string): void {
  if (breakRequested() === 'effect') {
    void Promise.reject(new Error(`${screen} was broken on purpose (?break=effect)`));
  }
}
