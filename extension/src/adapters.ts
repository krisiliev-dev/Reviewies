import { isConfident, parseEpisodeLabel, parseTitle, type EpisodeRef } from './parse';

/**
 * Per-site adapters.
 *
 * ⚠️ The CSS selectors below are the fragile part. Streaming sites redesign without
 * notice and rename obfuscated classes constantly, so treat every site-specific
 * selector as unverified until checked against the live page. This is the same
 * maintenance treadmill every scrobbler extension lives on.
 *
 * The design point is that breakage degrades rather than fails: each adapter falls
 * back to the page title, and the GenericAdapter handles any site with a <video> at
 * all. A stale selector costs precision, not function.
 */

export interface Detection {
  show?: string;
  season?: number;
  episode?: number;
  episodeTitle?: string;
  /** Playback position in seconds. */
  positionSec: number;
  durationSec: number;
  paused: boolean;
  site: string;
}

export interface SiteAdapter {
  readonly site: string;
  matches(hostname: string): boolean;
  /** Selectors tried in order to find the on-screen title. */
  readonly titleSelectors: readonly string[];
  /** Optional separate selector for the season/episode label. */
  readonly episodeSelectors?: readonly string[];
}

export const ADAPTERS: SiteAdapter[] = [
  {
    site: 'netflix',
    matches: (h) => h.endsWith('netflix.com'),
    titleSelectors: ['[data-uia="video-title"] h4', '[data-uia="video-title"]', '.video-title h4'],
    episodeSelectors: ['[data-uia="video-title"] span', '.video-title span'],
  },
  {
    site: 'prime',
    matches: (h) => /(^|\.)(primevideo\.com|amazon\.[a-z.]+)$/.test(h),
    titleSelectors: ['[data-automation-id="title"]', '.atvwebplayersdk-title-text'],
    episodeSelectors: ['.atvwebplayersdk-subtitle-text', '[data-automation-id="subtitle"]'],
  },
  {
    site: 'disney',
    matches: (h) => h.endsWith('disneyplus.com'),
    titleSelectors: ['.title-field', '[data-testid="title"]'],
    episodeSelectors: ['.subtitle-field', '[data-testid="subtitle"]'],
  },
  {
    site: 'max',
    matches: (h) => /(^|\.)(max\.com|hbomax\.com)$/.test(h),
    titleSelectors: ['[data-testid="player-ux-asset-title"]'],
    episodeSelectors: ['[data-testid="player-ux-asset-subtitle"]'],
  },
  {
    site: 'crunchyroll',
    matches: (h) => h.endsWith('crunchyroll.com'),
    titleSelectors: ['h4.show-title', '.erc-current-media-info .show-title'],
    episodeSelectors: ['h1.title', '.erc-current-media-info .title'],
  },
  {
    site: 'youtube',
    matches: (h) => /(^|\.)(youtube\.com)$/.test(h),
    titleSelectors: ['h1.ytd-watch-metadata yt-formatted-string', 'h1.title'],
  },
];

export function adapterFor(hostname: string): SiteAdapter | undefined {
  return ADAPTERS.find((a) => a.matches(hostname));
}

function textFrom(doc: Document, selectors: readonly string[] | undefined): string | undefined {
  if (!selectors) return undefined;
  for (const sel of selectors) {
    const text = doc.querySelector(sel)?.textContent?.trim();
    if (text) return text;
  }
  return undefined;
}

/** Pick the video most likely to be the feature: the longest one that has loaded. */
export function findVideo(doc: Document): HTMLVideoElement | undefined {
  const videos = [...doc.querySelectorAll('video')] as HTMLVideoElement[];
  // Ads and trailers are usually short; the real content is the longest.
  return videos
    .filter((v) => Number.isFinite(v.duration) && v.duration > 0)
    .sort((a, b) => b.duration - a.duration)[0];
}

/**
 * Read the current playback state from a page. Returns undefined when nothing is
 * playing or the detection is not confident enough to act on.
 */
export function detect(doc: Document, hostname: string): Detection | undefined {
  const video = findVideo(doc);
  if (!video) return undefined;

  const adapter = adapterFor(hostname);
  const site = adapter?.site ?? 'generic';

  const showText = textFrom(doc, adapter?.titleSelectors);
  const episodeText = textFrom(doc, adapter?.episodeSelectors);

  // Site selectors first, page title as the fallback that always exists.
  let parsed: { show?: string } & EpisodeRef;
  if (showText) {
    parsed = { show: showText, ...parseEpisodeLabel(episodeText) };
    // Some sites put everything in one node.
    if (parsed.episode == null) {
      const fromShow = parseEpisodeLabel(showText);
      if (fromShow.episode != null) parsed = { ...parseTitle(showText) };
    }
  } else {
    parsed = parseTitle(doc.title);
  }

  if (!isConfident(parsed)) return undefined;

  return {
    ...parsed,
    positionSec: video.currentTime,
    durationSec: video.duration,
    paused: video.paused,
    site,
  };
}

/**
 * Whether a detection represents genuine viewing rather than a trailer, an advert or
 * a stray autoplaying clip.
 */
export function isRealViewing(d: Detection): boolean {
  // Anything under two minutes is almost certainly not an episode.
  return d.durationSec > 120;
}

/** Scrobble threshold: the point at which something counts as watched. */
export function isWatched(d: Detection, threshold = 0.9): boolean {
  if (!isRealViewing(d) || !Number.isFinite(d.durationSec) || d.durationSec === 0) return false;
  return d.positionSec / d.durationSec >= threshold;
}
