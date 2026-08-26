import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ADAPTERS, adapterFor, detect, findVideo, isRealViewing, isWatched } from './adapters';

/**
 * The extension's first unit tests.
 *
 * It had none, and nothing said so: `npm run test --workspaces --if-present` skips a
 * workspace with no `test` script *silently*, so `npm run verify` had been reporting
 * green over five hundred lines nothing had ever executed. §6.68 found it by counting
 * which workspace produced which number and discovering that the seven tests attributed
 * to the extension were the phone's.
 *
 * The browser smoke suite (§6.42) is real and stays. What it cannot do is put an
 * adversarial hostname or a page with three videos in front of this code.
 */

const MANIFEST = JSON.parse(
  readFileSync(resolve(import.meta.dirname, '../manifest.json'), 'utf8'),
) as { host_permissions: string[] };

describe('choosing an adapter for a host', () => {
  it.each([
    ['www.netflix.com', 'netflix'],
    ['netflix.com', 'netflix'],
    ['www.primevideo.com', 'prime'],
    ['www.disneyplus.com', 'disney'],
    ['play.max.com', 'max'],
    ['www.hbomax.com', 'max'],
    ['www.crunchyroll.com', 'crunchyroll'],
    ['www.youtube.com', 'youtube'],
  ])('%s → %s', (host, site) => {
    expect(adapterFor(host)?.site).toBe(site);
  });

  it('has nothing to say about a site it does not know', () => {
    // Not an error: `detect` falls back to the generic path and the page title.
    expect(adapterFor('example.com')).toBeUndefined();
  });

  /**
   * Two lists of the same sites, which is how they drift.
   *
   * The manifest decides where the content script *runs*; the adapters decide what it
   * does when it gets there. An adapter for a host the manifest never grants is a
   * promise nothing can keep — and a host the manifest grants with no adapter falls
   * back to the page title, which is fine but should be a choice rather than an
   * oversight.
   */
  it('claims no site the manifest does not grant', () => {
    const granted = MANIFEST.host_permissions.map((p) =>
      p.replace(/^https:\/\/\*\./, 'www.').replace(/\/\*$/, ''),
    );
    const unreachable = ADAPTERS.filter((a) => !granted.some((host) => a.matches(host)));
    expect(unreachable.map((a) => a.site)).toEqual([]);
  });

  it('covers every site the manifest does grant', () => {
    const granted = MANIFEST.host_permissions.map((p) =>
      p.replace(/^https:\/\/\*\./, 'www.').replace(/\/\*$/, ''),
    );
    expect(granted.filter((host) => !adapterFor(host))).toEqual([]);
  });
});

describe('finding the video that is the programme', () => {
  const page = (durations: Array<number | undefined>) => {
    const doc = new DOMParser().parseFromString('<html><body></body></html>', 'text/html');
    for (const d of durations) {
      const video = doc.createElement('video');
      Object.defineProperty(video, 'duration', { value: d ?? NaN, configurable: true });
      doc.body.append(video);
    }
    return doc;
  };

  it('picks the longest, since ads and trailers are short', () => {
    const doc = page([30, 2700, 90]);
    expect(findVideo(doc)?.duration).toBe(2700);
  });

  it('ignores one that has not loaded a duration yet', () => {
    // NaN sorts unpredictably; a pre-roll that has not reported its length must not win.
    const doc = page([undefined, 1200]);
    expect(findVideo(doc)?.duration).toBe(1200);
  });

  it('has no answer for a page with no video', () => {
    expect(findVideo(page([]))).toBeUndefined();
  });
});

describe('reading what is playing', () => {
  function pageWith(html: string, title: string, duration = 2700, currentTime = 100) {
    const doc = new DOMParser().parseFromString(
      `<html><head><title>${title}</title></head><body>${html}<video></video></body></html>`,
      'text/html',
    );
    const video = doc.querySelector('video')!;
    Object.defineProperty(video, 'duration', { value: duration });
    Object.defineProperty(video, 'currentTime', { value: currentTime });
    Object.defineProperty(video, 'paused', { value: false });
    return doc;
  }

  it('reads a Netflix title and its episode label', () => {
    const doc = pageWith(
      '<div data-uia="video-title"><h4>The Long Dark</h4><span>S2:E4 Aftermath</span></div>',
      'Netflix',
    );
    expect(detect(doc, 'www.netflix.com')).toMatchObject({
      show: 'The Long Dark',
      season: 2,
      episode: 4,
      site: 'netflix',
    });
  });

  it('falls back to the page title on a site with no adapter', () => {
    // The property that makes a rotted selector cost precision rather than function.
    const doc = pageWith('', 'The Long Dark - S2E4 - Aftermath');
    expect(detect(doc, 'example.com')).toMatchObject({ season: 2, episode: 4, site: 'generic' });
  });

  it('falls back to the page title when the site’s selectors find nothing', () => {
    // Which is what a redesign looks like: the adapter matches, the selectors miss.
    const doc = pageWith('<div class="nothing-we-know"></div>', 'The Long Dark - S2E4');
    expect(detect(doc, 'www.netflix.com')).toMatchObject({ season: 2, episode: 4 });
  });

  it('says nothing at all when it cannot tell what is on', () => {
    // Better silent than scrobbling the wrong episode to somebody's history. A browse
    // page's title is often just the service name, and with no selector matching, the
    // page-title fallback read that as a film called "Netflix" — which a billboard
    // preview looping past two minutes would then scrobble at ninety percent. §6.68.
    expect(detect(pageWith('', 'Netflix'), 'www.netflix.com')).toBeUndefined();
  });

  it.each(['YouTube', 'Crunchyroll', 'Prime Video', 'Disney+', 'Hulu'])(
    'does not think %s is a programme',
    (title) => {
      expect(detect(pageWith('', title), 'example.com')).toBeUndefined();
    },
  );

  it('still reads a title that merely mentions the service', () => {
    // The ban is on the service name being the *whole* of it, not on the word.
    expect(detect(pageWith('', 'The Netflix Effect - S1E2'), 'example.com')).toMatchObject({
      season: 1,
      episode: 2,
    });
  });

  it('says nothing when there is no video, whatever the page claims', () => {
    const doc = new DOMParser().parseFromString(
      '<html><head><title>The Long Dark - S2E4</title></head><body></body></html>',
      'text/html',
    );
    expect(detect(doc, 'www.netflix.com')).toBeUndefined();
  });

  it('carries the playback position through, which is what Watching Mode wants', () => {
    const doc = pageWith('', 'The Long Dark - S2E4', 2700, 942);
    expect(detect(doc, 'example.com')).toMatchObject({ positionSec: 942, durationSec: 2700 });
  });
});

describe('deciding whether this counts', () => {
  const detection = (durationSec: number, positionSec: number) => ({
    show: 'The Long Dark',
    season: 1,
    episode: 1,
    positionSec,
    durationSec,
    paused: false,
    site: 'netflix',
  });

  it('ignores anything under two minutes', () => {
    // A trailer, an advert, an autoplaying clip on a browse page.
    expect(isRealViewing(detection(90, 89))).toBe(false);
  });

  it('accepts an episode', () => {
    expect(isRealViewing(detection(1320, 10))).toBe(true);
  });

  it('counts as watched at nine tenths', () => {
    expect(isWatched(detection(1000, 900))).toBe(true);
  });

  it('does not count just before that', () => {
    expect(isWatched(detection(1000, 899))).toBe(false);
  });

  it('never counts a trailer, however far through it is', () => {
    expect(isWatched(detection(90, 90))).toBe(false);
  });

  it('does not divide by a duration it does not have', () => {
    expect(isWatched(detection(0, 0))).toBe(false);
    expect(isWatched({ ...detection(1, 1), durationSec: Number.POSITIVE_INFINITY })).toBe(false);
  });
});
