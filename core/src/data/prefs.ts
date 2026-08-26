import { readPreference, writePreference } from './storage.ts';

/**
 * Small on-device preferences.
 *
 * Deliberately key/value rather than the database: these are per-device display
 * choices, not user data, and nothing here is worth syncing or exporting. The store
 * itself is injected and every access is guarded, because private browsing can make
 * web storage throw rather than return null.
 */

const OPEN_COMMENTS = 'reviewies.openCommentsAfterWatch';

/**
 * Open an episode's conversation straight after marking it watched.
 *
 * Doc 8 §4: two competing apps are criticised by name for *not* doing this — "after
 * checking a episode the episode dialogue is not automatically opened". It is how TV
 * Time worked, and comments were what people actually valued.
 *
 * On by default, but only ever acted on when sync is configured; without an account
 * there is no conversation to open and it would be a dead end. Off is offered because
 * anyone marking several episodes in a row wants to stay where they are — and
 * catching up in bulk has its own control that never navigates.
 */
export function openCommentsAfterWatch(): boolean {
  return readPreference(OPEN_COMMENTS) !== 'off';
}

export function setOpenCommentsAfterWatch(on: boolean): void {
  writePreference(OPEN_COMMENTS, on ? 'on' : 'off');
}
