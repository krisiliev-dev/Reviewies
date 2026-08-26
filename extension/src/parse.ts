/**
 * Turning a streaming site's on-screen label into a season and episode number.
 *
 * Every service writes this differently, and they change it without warning. This is
 * the part of the extension most worth getting right and most worth testing, because
 * the DOM selectors around it are guaranteed to rot while the label formats are
 * fairly stable.
 */

export interface EpisodeRef {
  season?: number;
  episode?: number;
  episodeTitle?: string;
}

const PATTERNS: Array<{ re: RegExp; season: number; episode: number }> = [
  // Netflix: "S1:E4", sometimes "S1: E4"
  { re: /\bS(\d{1,3})\s*:\s*E(\d{1,4})\b/i, season: 1, episode: 2 },
  // Common: "S01E04", "s1e4"
  { re: /\bS(\d{1,3})\s*E(\d{1,4})\b/i, season: 1, episode: 2 },
  // Prime Video and others: "Season 1, Episode 4" / "Season 1: Episode 4"
  { re: /\bSeason\s+(\d{1,3})\s*[,:]?\s*Episode\s+(\d{1,4})\b/i, season: 1, episode: 2 },
  // Plex/Kodi style: "1x04"
  { re: /\b(\d{1,3})\s*x\s*(\d{1,4})\b/i, season: 1, episode: 2 },
  // Disney+ and others sometimes lead with the episode: "E4 · S1"
  { re: /\bE(\d{1,4})\s*[·|,]\s*S(\d{1,3})\b/i, season: 2, episode: 1 },
];

/** Extract a season/episode reference from arbitrary label text. */
export function parseEpisodeLabel(text: string | null | undefined): EpisodeRef {
  if (!text) return {};
  const cleaned = text.replace(/\s+/g, ' ').trim();

  for (const { re, season, episode } of PATTERNS) {
    const m = cleaned.match(re);
    if (!m) continue;

    const s = Number(m[season]);
    const e = Number(m[episode]);
    if (!Number.isFinite(s) || !Number.isFinite(e)) continue;

    return { season: s, episode: e, episodeTitle: titleAfterMatch(cleaned, m) };
  }

  // "Episode 4" with no season is common on single-season shows.
  const epOnly = cleaned.match(/\bEpisode\s+(\d{1,4})\b/i);
  if (epOnly) return { episode: Number(epOnly[1]), episodeTitle: titleAfterMatch(cleaned, epOnly) };

  return {};
}

/** Whatever follows the season/episode marker is usually the episode title. */
function titleAfterMatch(text: string, m: RegExpMatchArray): string | undefined {
  const rest = text.slice((m.index ?? 0) + m[0].length);
  const cleaned = rest.replace(/^[\s\-–—:·|.]+/, '').trim();
  return cleaned.length > 0 && cleaned.length < 200 ? cleaned : undefined;
}

/**
 * Split a combined page title into show name and episode reference.
 *
 * Handles the shapes these sites actually use, e.g.
 *   "The Long Dark: Season 1: Thaw"
 *   "Kitchen Nightshift - S1:E4 Closing Time"
 *   "Watch Hollow Crown Saga | Season 2 Episode 3"
 */
export function parseTitle(raw: string | null | undefined): { show?: string } & EpisodeRef {
  if (!raw) return {};

  let text = raw
    .replace(/\s+/g, ' ')
    .replace(/\s*[-|]\s*(Netflix|Prime Video|Disney\+|Max|Hulu|Crunchyroll)\s*$/i, '')
    .replace(/^Watch\s+/i, '')
    .trim();

  const ref = parseEpisodeLabel(text);

  // The show name is whatever precedes the first season/episode marker.
  const markerIndex = text.search(
    /\bS\d{1,3}\s*:?\s*E\d{1,4}\b|\bSeason\s+\d{1,3}\b|\bEpisode\s+\d{1,4}\b|\b\d{1,3}\s*x\s*\d{1,4}\b/i,
  );

  let show: string | undefined;
  if (markerIndex > 0) {
    show = text.slice(0, markerIndex).replace(/[\s\-–—:·|,]+$/, '').trim();
  } else if (markerIndex === -1) {
    // No episode markers at all — treat the whole thing as a film title.
    show = text.replace(/[\s\-–—:·|,]+$/, '').trim() || undefined;
  }

  return { show: show || undefined, ...ref };
}

/**
 * Whether a detection is precise enough to act on.
 *
 * Guessing wrong marks the wrong episode watched, which is worse than not detecting
 * anything — a silent corruption of history the user has to find and undo.
 */
export function isConfident(d: { show?: string } & EpisodeRef): boolean {
  if (!d.show || d.show.length < 2) return false;
  if (isServiceName(d.show)) return false;
  // A film needs only a title; an episode needs a number.
  return d.episode == null || Number.isFinite(d.episode);
}

/**
 * The services' own names, which are not programmes.
 *
 * A browse page's `document.title` is often just the service — Netflix's is literally
 * "Netflix", YouTube's home page is "YouTube" — and with no site selector matching, the
 * page-title fallback reads that as a film. The duration gate stops most of it, but a
 * billboard preview that loops past two minutes would be scrobbled at ninety percent as
 * a film called *Netflix*, straight into somebody's history.
 *
 * `parseTitle` already strips a trailing " - Netflix" from an episode's title; this is
 * the case where the service name is the *whole* of it. §6.68.
 */
const SERVICE_NAMES = new Set([
  'netflix',
  'prime video',
  'amazon prime video',
  'disney+',
  'disneyplus',
  'max',
  'hbo max',
  'hulu',
  'crunchyroll',
  'youtube',
]);

function isServiceName(show: string): boolean {
  return SERVICE_NAMES.has(show.trim().toLowerCase());
}
