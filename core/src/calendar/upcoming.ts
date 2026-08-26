import { db } from '../data/db.ts';
import { readPreference, writePreference } from '../data/storage.ts';
import type { CachedEpisode } from '../domain/types.ts';
import { dayKey, startOfDay } from '../time.ts';

/**
 * Upcoming episodes, and how loudly to announce them.
 *
 * Notification granularity was a top Trakt roadmap request: people want premieres
 * and finales without being pinged for every episode of every show they track. So
 * classification is a first-class concept rather than an afterthought.
 */

export type EpisodeKind = 'premiere' | 'finale' | 'series-finale' | 'regular';

export type NotifyPreference = 'off' | 'milestones' | 'all';

export interface UpcomingEntry {
  episode: CachedEpisode;
  seriesId: string;
  seriesName: string;
  posterUrl?: string;
  kind: EpisodeKind;
  /** Local date key, yyyy-mm-dd, for grouping. */
  day: string;
}

/**
 * Classify an episode within its show.
 *
 * `allEpisodes` must be the whole series, not one season: telling a season finale
 * from a series finale needs to know whether any later season exists.
 */
export function classify(episode: CachedEpisode, allEpisodes: CachedEpisode[]): EpisodeKind {
  // Specials are never milestones; a Christmas special is not a premiere.
  if (episode.season === 0) return 'regular';

  const sameSeason = allEpisodes.filter((e) => e.season === episode.season);
  if (sameSeason.length === 0) return 'regular';

  const isFirst = episode.number === Math.min(...sameSeason.map((e) => e.number));
  const isLast = episode.number === Math.max(...sameSeason.map((e) => e.number));

  if (isLast) {
    const laterSeasonExists = allEpisodes.some((e) => e.season > episode.season);
    return laterSeasonExists ? 'finale' : 'series-finale';
  }
  // A one-episode season is a finale rather than a premiere: ending beats starting.
  if (isFirst) return 'premiere';
  return 'regular';
}

export function shouldNotify(kind: EpisodeKind, preference: NotifyPreference): boolean {
  if (preference === 'off') return false;
  if (preference === 'all') return true;
  return kind !== 'regular';
}

/**
 * How far ahead the calendar looks, on both platforms.
 *
 * It was 60 on the web and 30 on the phone — the same screen showing a different amount
 * of the future depending on which one you opened, which nothing could see because each
 * side passed its own number at the call site. Sixty, because a season premiere
 * announced two months out is exactly the thing somebody opens this screen to find.
 *
 * The sentence in `COPY.calendar.empty` says "the next two months" and is checked
 * against this number, so the two cannot drift apart.
 */
export const UPCOMING_DAYS = 60;

/**
 * Episodes airing within the next `days`, from shows you are actively watching.
 *
 * Paused and dropped shows are excluded — being reminded about something you
 * deliberately stopped is exactly the noise people complain about.
 */
export async function getUpcoming(days = UPCOMING_DAYS, now = Date.now()): Promise<UpcomingEntry[]> {
  // Both ends of the window in the viewer's own calendar, and compared against air dates
  // read the same way. Before §6.66 an air date was parsed as UTC midnight and compared
  // against a real instant, so the boundary moved by the viewer's offset: west of
  // Greenwich tomorrow's episode appeared this evening, and east of it today's episode
  // was already "past" before breakfast.
  const from = startOfDay(dayKey(now));
  const until = from + days * 86_400_000;
  const tracked = await db.library.where('status').equals('watching').toArray();
  const titles = new Map((await db.titles.toArray()).map((t) => [t.id, t]));

  const entries: UpcomingEntry[] = [];

  for (const item of tracked) {
    if (item.kind !== 'show') continue;
    const all = await db.episodes.where('seriesId').equals(item.titleId).toArray();

    for (const episode of all) {
      if (!episode.airDate) continue;
      const airs = startOfDay(episode.airDate);
      if (!Number.isFinite(airs) || airs < from || airs > until) continue;

      const title = titles.get(item.titleId);
      entries.push({
        episode,
        seriesId: item.titleId,
        seriesName: title?.name ?? 'Unknown',
        posterUrl: item.posterOverride ?? title?.posterUrl,
        kind: classify(episode, all),
        day: episode.airDate.slice(0, 10),
      });
    }
  }

  // By day string: same order, and no second reading of the date to disagree with the
  // first one.
  return entries.sort((a, b) => a.day.localeCompare(b.day));
}

export function groupByDay(entries: UpcomingEntry[]): Array<[string, UpcomingEntry[]]> {
  const groups = new Map<string, UpcomingEntry[]>();
  for (const entry of entries) {
    const list = groups.get(entry.day) ?? [];
    list.push(entry);
    groups.set(entry.day, list);
  }
  return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

export const KIND_LABEL: Record<EpisodeKind, string> = {
  premiere: 'Premiere',
  finale: 'Season finale',
  'series-finale': 'Series finale',
  regular: '',
};

// ---------------------------------------------------------------------------
// Notification preference
// ---------------------------------------------------------------------------

const PREF_KEY = 'reviewies.notify';

export function getPreference(): NotifyPreference {
  const stored = readPreference(PREF_KEY);
  if (stored === 'off' || stored === 'milestones' || stored === 'all') return stored;
  // Milestones by default: useful without being the thing people complain about.
  return 'milestones';
}

export function setPreference(preference: NotifyPreference): void {
  writePreference(PREF_KEY, preference);
}

/**
 * Ask for notification permission.
 *
 * On iOS this only works once the app is installed to the Home Screen — the Push API
 * is unavailable in a Safari tab. Callers must handle a refusal gracefully rather
 * than treating notifications as guaranteed.
 */
export async function requestPermission(): Promise<NotificationPermission> {
  if (typeof Notification === 'undefined') return 'denied';
  if (Notification.permission !== 'default') return Notification.permission;
  try {
    return await Notification.requestPermission();
  } catch {
    return 'denied';
  }
}

/** Whether this browser can deliver notifications at all. */
export function notificationsSupported(): boolean {
  return typeof Notification !== 'undefined';
}

/**
 * The notification choices, with the words people read.
 *
 * Here rather than in either screen because both screens had their own copy of the list
 * and all three hints had drifted — "No alerts at all." against "No notifications at
 * all", and an every-episode hint that promised different things on each platform.
 */
export const NOTIFY_OPTIONS: ReadonlyArray<{
  key: NotifyPreference;
  label: string;
  hint: string;
}> = [
  { key: 'off', label: 'Nothing', hint: 'No notifications at all.' },
  {
    key: 'milestones',
    label: 'Premieres & finales',
    hint: 'The moments worth knowing about, without a ping per episode.',
  },
  { key: 'all', label: 'Every episode', hint: 'One notification for everything you track.' },
];
