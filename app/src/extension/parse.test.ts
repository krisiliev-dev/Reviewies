import { describe, expect, it } from 'vitest';
import { isConfident, parseEpisodeLabel, parseTitle } from '../../../extension/src/parse';
import { adapterFor, detect, isRealViewing, isWatched } from '../../../extension/src/adapters';

/**
 * The extension's parsing logic, which is what decides whether we mark the right
 * episode watched. Guessing wrong silently corrupts someone's history, so the
 * refusal cases matter as much as the successes.
 */

describe('parseEpisodeLabel', () => {
  it.each([
    ['S1:E4', 1, 4],
    ['S1: E4', 1, 4],
    ['S01E04', 1, 4],
    ['s2e11', 2, 11],
    ['Season 3, Episode 7', 3, 7],
    ['Season 3: Episode 7', 3, 7],
    ['1x04', 1, 4],
    ['12x134', 12, 134],
  ])('parses %s', (input, season, episode) => {
    expect(parseEpisodeLabel(input)).toMatchObject({ season, episode });
  });

  it('extracts the episode title that follows the marker', () => {
    expect(parseEpisodeLabel('S1:E4 Closing Time')).toMatchObject({
      season: 1,
      episode: 4,
      episodeTitle: 'Closing Time',
    });
  });

  it('handles an episode number with no season', () => {
    expect(parseEpisodeLabel('Episode 6')).toMatchObject({ episode: 6 });
  });

  it('returns nothing for text with no episode marker', () => {
    expect(parseEpisodeLabel('Quiet Harbour')).toEqual({});
  });

  it('returns nothing for empty input rather than throwing', () => {
    expect(parseEpisodeLabel(undefined)).toEqual({});
    expect(parseEpisodeLabel('')).toEqual({});
  });

  it('does not mistake a year for an episode reference', () => {
    expect(parseEpisodeLabel('Blade Runner 2049').episode).toBeUndefined();
  });
});

describe('parseTitle', () => {
  it('splits show name from season and episode', () => {
    expect(parseTitle('The Long Dark: Season 1: Episode 4')).toMatchObject({
      show: 'The Long Dark',
      season: 1,
      episode: 4,
    });
  });

  it('handles the dash-separated form', () => {
    expect(parseTitle('Kitchen Nightshift - S1:E4 Closing Time')).toMatchObject({
      show: 'Kitchen Nightshift',
      season: 1,
      episode: 4,
    });
  });

  it('strips the service suffix', () => {
    expect(parseTitle('The Long Dark - S2:E1 | Netflix').show).toBe('The Long Dark');
  });

  it('strips a leading "Watch"', () => {
    expect(parseTitle('Watch Hollow Crown Saga | Season 2 Episode 3').show).toBe(
      'Hollow Crown Saga',
    );
  });

  it('treats a title with no markers as a film', () => {
    const parsed = parseTitle('Quiet Harbour');
    expect(parsed.show).toBe('Quiet Harbour');
    expect(parsed.episode).toBeUndefined();
  });
});

describe('confidence gate', () => {
  it('accepts a film with just a title', () => {
    expect(isConfident({ show: 'Quiet Harbour' })).toBe(true);
  });

  it('accepts a fully identified episode', () => {
    expect(isConfident({ show: 'The Long Dark', season: 1, episode: 4 })).toBe(true);
  });

  it('rejects a detection with no show name', () => {
    // Better to detect nothing than to mark the wrong thing watched.
    expect(isConfident({ season: 1, episode: 4 })).toBe(false);
  });

  it('rejects a one-character show name', () => {
    expect(isConfident({ show: 'x' })).toBe(false);
  });
});

describe('site adapters', () => {
  it.each([
    ['www.netflix.com', 'netflix'],
    ['www.primevideo.com', 'prime'],
    ['www.disneyplus.com', 'disney'],
    ['play.max.com', 'max'],
    ['www.crunchyroll.com', 'crunchyroll'],
    ['www.youtube.com', 'youtube'],
  ])('recognises %s', (host, site) => {
    expect(adapterFor(host)?.site).toBe(site);
  });

  it('does not match an unrelated host', () => {
    expect(adapterFor('example.com')).toBeUndefined();
  });

  it('does not let a lookalike domain match', () => {
    // notnetflix.com must not be treated as Netflix.
    expect(adapterFor('notnetflix.com.evil.test')).toBeUndefined();
  });
});

describe('detection from the DOM', () => {
  function pageWith(html: string, opts: { duration?: number; current?: number; paused?: boolean } = {}) {
    const doc = document.implementation.createHTMLDocument('test');
    doc.body.innerHTML = html;
    const video = doc.createElement('video');
    // jsdom does not implement playback, so these are defined directly.
    Object.defineProperty(video, 'duration', { value: opts.duration ?? 3000 });
    Object.defineProperty(video, 'currentTime', { value: opts.current ?? 600 });
    Object.defineProperty(video, 'paused', { value: opts.paused ?? false });
    doc.body.appendChild(video);
    return doc;
  }

  it('reads title and position from a Netflix-shaped page', () => {
    const doc = pageWith(
      '<div data-uia="video-title"><h4>The Long Dark</h4><span>S1:E4 Thaw</span></div>',
    );
    const d = detect(doc, 'www.netflix.com');
    expect(d).toMatchObject({ show: 'The Long Dark', season: 1, episode: 4, site: 'netflix' });
    expect(d?.positionSec).toBe(600);
  });

  it('falls back to the page title when selectors do not match', () => {
    // This is what happens when a site redesign breaks our selectors: reduced
    // precision, not failure.
    const doc = pageWith('<div class="totally-new-markup">x</div>');
    doc.title = 'Kitchen Nightshift - S1:E4 Closing Time';
    expect(detect(doc, 'www.netflix.com')).toMatchObject({
      show: 'Kitchen Nightshift',
      season: 1,
      episode: 4,
    });
  });

  it('returns nothing when there is no video', () => {
    const doc = document.implementation.createHTMLDocument('test');
    doc.title = 'The Long Dark - S1:E1';
    expect(detect(doc, 'www.netflix.com')).toBeUndefined();
  });

  it('returns nothing when the title is unidentifiable', () => {
    const doc = pageWith('');
    doc.title = '';
    expect(detect(doc, 'example.com')).toBeUndefined();
  });

  it('prefers the longest video, so adverts and trailers are ignored', () => {
    const doc = pageWith('');
    doc.title = 'Quiet Harbour';
    const ad = doc.createElement('video');
    Object.defineProperty(ad, 'duration', { value: 30 });
    Object.defineProperty(ad, 'currentTime', { value: 5 });
    doc.body.prepend(ad);

    expect(detect(doc, 'example.com')?.durationSec).toBe(3000);
  });
});

describe('scrobble thresholds', () => {
  const base = { show: 'x', positionSec: 0, durationSec: 3000, paused: false, site: 'generic' };

  it('treats a short clip as not real viewing', () => {
    expect(isRealViewing({ ...base, durationSec: 45 })).toBe(false);
  });

  it('does not mark watched early on', () => {
    expect(isWatched({ ...base, positionSec: 600 })).toBe(false);
  });

  it('marks watched past the threshold', () => {
    expect(isWatched({ ...base, positionSec: 2800 })).toBe(true);
  });

  it('never marks a short clip watched even at the end', () => {
    expect(isWatched({ ...base, durationSec: 30, positionSec: 30 })).toBe(false);
  });

  it('handles a zero duration without dividing by zero', () => {
    expect(isWatched({ ...base, durationSec: 0, positionSec: 0 })).toBe(false);
  });
});
