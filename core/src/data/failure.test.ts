import { afterEach, describe, expect, it } from 'vitest';
import { onFailure, reportFailure, resetFailures } from './failure.ts';

/**
 * The bus, and the window before anybody is listening.
 *
 * Found by breaking a screen on purpose rather than by reading the code: the phone's
 * root layout renders a spinner until the platform is bound, so the banner is not in the
 * tree yet — and a failure during startup reached an empty listener set and vanished.
 * The listeners are attached at module load now, and the bus keeps the last failure so a
 * subscriber that arrives afterwards still hears about it.
 */
afterEach(() => resetFailures());

describe('a failure with nobody listening yet', () => {
  it('reaches whoever subscribes next', () => {
    reportFailure(new Error('happened during startup'));

    const heard: string[] = [];
    onFailure((f) => heard.push(f.message));

    expect(heard).toEqual(['happened during startup']);
  });

  it('is not replayed to a subscriber that already heard it', () => {
    const heard: string[] = [];
    onFailure((f) => heard.push(f.message));

    reportFailure(new Error('once'));

    // Subscribed before it happened, so it arrives once through the live path and is
    // not handed to it again from the retained value.
    expect(heard).toEqual(['once']);
  });

  it('says something useful about a thing that is not an Error', () => {
    // Rejections carry whatever they were rejected with, which is not always an Error.
    const heard: string[] = [];
    onFailure((f) => heard.push(f.message));

    reportFailure('a bare string');
    reportFailure({ nothing: 'useful' });

    expect(heard).toEqual(['a bare string', 'Something went wrong']);
  });
});
