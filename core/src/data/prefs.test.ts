import { beforeEach, describe, expect, it, vi } from 'vitest';
import { openCommentsAfterWatch, setOpenCommentsAfterWatch } from './prefs.ts';

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('opening comments after marking watched', () => {
  it('is on by default, because that is how TV Time worked', () => {
    expect(openCommentsAfterWatch()).toBe(true);
  });

  it('can be turned off and stays off', () => {
    setOpenCommentsAfterWatch(false);
    expect(openCommentsAfterWatch()).toBe(false);
  });

  it('can be turned back on', () => {
    setOpenCommentsAfterWatch(false);
    setOpenCommentsAfterWatch(true);
    expect(openCommentsAfterWatch()).toBe(true);
  });

  it('falls back to the default when storage throws', () => {
    // Private browsing makes localStorage throw rather than return null; a preference
    // read must never be able to break marking an episode watched.
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(openCommentsAfterWatch()).toBe(true);
  });

  it('does not throw when storage refuses a write', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    expect(() => setOpenCommentsAfterWatch(false)).not.toThrow();
  });
});
