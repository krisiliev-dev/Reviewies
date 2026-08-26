import { getSession } from '../sync/auth.ts';
import { addToList, createList, fetchLists } from './lists.ts';
import { findByHandle, follow } from './people.ts';
import type { AccountExport } from './exportAccount.ts';
import type { MediaKind } from '../domain/types.ts';

/**
 * Put back the half of an export that does not live on the device.
 *
 * The export carries lists, follows and comments; the local import restored none of
 * them and said so, which was honest and half a feature. Somebody moving to a new
 * account, or recovering after losing one, had a file with their lists in it and no way
 * to put them back — which is the exact complaint this project exists to answer.
 *
 * Separate from `importBundle` on purpose. That runs in one local transaction and must
 * never wait on a network; this needs an account, makes one request per list item, and
 * can partly succeed. Two different things, honestly reported, beats one that sometimes
 * half-works.
 */

export interface RestoreReport {
  lists: number;
  listItems: number;
  follows: number;
  /** Everything not restored, said in sentences a person can act on. */
  skipped: string[];
}

/**
 * Restore what can be restored, and say what could not.
 *
 * Deliberately not restoring comments. Re-posting them would put old text into other
 * people's episode threads with today's timestamps — a restore is not a reason to
 * repopulate a conversation — and the file keeps them for the person who owns them.
 */
export async function restoreAccount(account: AccountExport): Promise<RestoreReport> {
  const report: RestoreReport = { lists: 0, listItems: 0, follows: 0, skipped: [] };

  const session = await getSession();
  if (!session) {
    report.skipped.push('Sign in first: lists and follows belong to an account.');
    return report;
  }

  // Names already here, so running a restore twice does not leave two of everything.
  // Matching on name rather than on anything sturdier because a restored list is a new
  // row with a new ID: there is nothing else the two copies share.
  //
  // And it stops if that read failed rather than treating the failure as an empty
  // account. This used to return a bare array, so a request that never arrived was
  // indistinguishable from having no lists — and the restore would have made a second
  // copy of every one of them. Doing nothing is recoverable; duplicating somebody's
  // lists is a mess they have to clean up by hand.
  const known = await fetchLists();
  if (known.failed) {
    report.skipped.push(
      `Could not check what is already here (${known.failed}), so nothing was restored. Try again.`,
    );
    return report;
  }
  const existing = new Set(known.lists.map((list) => list.name.trim().toLowerCase()));

  for (const list of account.lists) {
    if (existing.has(list.name.trim().toLowerCase())) {
      report.skipped.push(`"${list.name}" is already here, so it was left alone.`);
      continue;
    }

    const id = await createList(list.name, list.isPublic, list.description);
    if (!id) {
      report.skipped.push(`"${list.name}" could not be created.`);
      continue;
    }
    report.lists++;
    existing.add(list.name.trim().toLowerCase());

    // Sequentially, in file order. `addToList` does not set a rank, so the ordering
    // falls back to `added_at` — which reproduces the original order only if the
    // inserts happen in it, and not at all if they race.
    for (const item of list.items) {
      const added = await addToList(id, item.titleId, item.kind as MediaKind, item.note);
      if (added.ok) report.listItems++;
      else report.skipped.push(`${item.titleId} could not be added to "${list.name}": ${added.reason}`);
    }
  }

  for (const handle of account.following) {
    const found = await findByHandle(handle);
    // Two different things to say. "Could not be found" is a statement about somebody
    // else's account and the wrong one to make because a request failed — the first
    // sends you looking for a deleted account, the second tells you to try again.
    if (found.failed) {
      report.skipped.push(`@${handle} could not be looked up (${found.failed}). Try again.`);
      continue;
    }
    if (!found.person) {
      // Named rather than dropped: an account that has gone, or been renamed, is
      // something the person can go and look for.
      report.skipped.push(`@${handle} could not be found.`);
      continue;
    }
    const followed = await follow(found.person.id);
    if (followed.ok) report.follows++;
    else report.skipped.push(`@${handle} could not be followed: ${followed.reason}`);
  }

  if (account.comments.length) {
    report.skipped.push(
      `${account.comments.length} comment(s) were left in the file rather than posted again.`,
    );
  }

  return report;
}
