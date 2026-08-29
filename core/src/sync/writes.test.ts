import { describe, expect, it } from 'vitest';
import { globSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Every write to a syncable table, and whether it queues.
 *
 * Two bugs of this shape were found by reasoning about one flow at a time, and between
 * them they meant a rescued history lived on one device, a tracked show never reached a
 * second, a poster override never left, a show completing itself never replicated, and
 * clearing a rating quietly undid itself on the next pull. None of that showed up
 * anywhere: local writes work perfectly, and the absence is only visible from a device
 * that never sees the row.
 *
 * So this looks rather than reasons. It is a source scan, which is crude — it cannot see
 * through a helper or a variable — and the honesty is in the allowlist: every site that
 * legitimately does not queue is named here with the reason, rather than excused by a
 * rule with a hole in it.
 */
const ROOT = resolve(__dirname, '../../..');
const SYNCED = ['watches', 'ratings', 'watchlist', 'library', 'reactions'];
const WRITES = /db\.(watches|ratings|watchlist|library|reactions)\.(put|add|delete|bulkPut|bulkAdd|update)\b/g;

/**
 * What counts as queueing.
 *
 * Named helpers are allowed and have to be listed, which is the point: adding one is a
 * visible act rather than a way round the rule.
 */
const QUEUEING = /\b(enqueue|enqueueAll|queueLibrary)\(/;

/**
 * Split a source file into rough function bodies.
 *
 * Rough is the honest word. It splits on top-level declarations, so a write inside a
 * nested closure is attributed to the function that contains it — which is what we want
 * — and a file with no functions at all is one block, which is the coarse case this
 * cannot improve on.
 */
function blocks(source: string): Array<{ name: string; body: string }> {
  const starts = [...source.matchAll(/^(?:export )?(?:async )?function (\w+)/gm)];
  if (starts.length === 0) return [{ name: '(file)', body: source }];

  return starts.map((match, index) => ({
    name: match[1],
    body: source.slice(match.index, starts[index + 1]?.index ?? source.length),
  }));
}

/**
 * Writes that must not queue, each for a stated reason.
 *
 * The reverse direction is the one that matters here: rows written *by* a pull came from
 * the server, and sending them back is a loop nobody notices until it has spent
 * somebody's data allowance.
 */
const ALLOWED = new Map<string, string>([
  [
    'core/src/watching/reactions.ts:fetchRemoteReactions',
    'writes what a pull just fetched; queueing it would send the server its own rows',
  ],
  [
    'core/src/sync/engine.ts:applyRemote',
    'the pull itself, for the same reason',
  ],
]);

function scan(): Array<{ where: string; source: string }> {
  const files = [
    ...globSync('core/src/**/*.ts', { cwd: ROOT }),
    ...globSync('app/src/**/*.{ts,tsx}', { cwd: ROOT }),
    ...globSync('mobile/{src,app}/**/*.{ts,tsx}', { cwd: ROOT }),
  ].filter((path) => !path.includes('.test.'));

  return files.map((path) => ({ where: path, source: readFileSync(resolve(ROOT, path), 'utf8') }));
}

describe('writes to a synced table', () => {
  it('are covered by this scan at all', () => {
    // Non-vacuous: a glob that matched nothing, or a pattern that matched nothing, would
    // let every assertion below pass while looking at an empty set.
    const files = scan();
    expect(files.length).toBeGreaterThan(40);
    const writing = files.filter(({ source }) => new RegExp(WRITES.source).test(source));
    expect(writing.length).toBeGreaterThan(4);
  });

  it('queue, or say why they do not', () => {
    const unqueued: string[] = [];

    for (const { where, source } of scan()) {
      // Per function, not per file. A file-level check was written first and would not
      // have caught the bug that prompted this: repo.ts queues in `rate` and in every
      // watchlist path, so the file mentions the queue — and `addToLibrary` still wrote
      // a row that never left the device.
      for (const block of blocks(source)) {
        const matches = [...block.body.matchAll(WRITES)];
        if (matches.length === 0) continue;

        const site = `${where}:${block.name}`;
        if (QUEUEING.test(block.body) || ALLOWED.has(site)) continue;
        unqueued.push(`${site} writes ${[...new Set(matches.map((m) => m[1]))].join(', ')}`);
      }
    }

    expect(unqueued).toEqual([]);
  });

  it('hold the write and the queue entry together, in one transaction', () => {
    /*
     * The pair, not just the presence of both halves.
     *
     * The clause above asks whether a block queues at all. It passed for eleven sites
     * that did it as two bare `await`s — the local write first, so the interface never
     * waits on the queue, and then the outbox entry. §6.155 took the tab away in between,
     * in a real browser, and **9 of 18 runs left the watch with no queue entry**: an
     * episode marked on one device for ever, invisible to every screen in the product,
     * because the outbox is the only record that a row still needs sending.
     *
     * `queued()` is the wrapper for a single write; the four importers use `db.transaction`
     * directly because they scope several tables at once. Either satisfies this. What does
     * not is a block that writes and queues with nothing holding the two together.
     *
     * A source scan, with the same crudeness the file's header admits to: it cannot see
     * through a helper. `app/smoke.mjs` holds the behavioural half, in a browser, by
     * actually interrupting the write.
     */
    const HOLDS = /\b(queued|db\.transaction)\(/;
    const loose: string[] = [];

    for (const { where, source } of scan()) {
      for (const block of blocks(source)) {
        const matches = [...block.body.matchAll(WRITES)];
        if (matches.length === 0) continue;
        const site = `${where}:${block.name}`;
        if (ALLOWED.has(site)) continue;
        // Only the blocks that queue: one that does not is the clause above's business.
        if (!QUEUEING.test(block.body)) continue;

        const held = block.body.search(HOLDS);
        const wrote = matches[0].index ?? 0;
        if (held === -1 || held > wrote) {
          loose.push(`${site} writes ${[...new Set(matches.map((m) => m[1]))].join(', ')}`);
        }
      }
    }

    expect(loose).toEqual([]);
  });

  it('names a reason for each write that is exempt', () => {
    // An allowlist without reasons is a rule with silent exceptions.
    for (const [site, reason] of ALLOWED) {
      expect(site, `${site} has no reason`).toBeTruthy();
      expect(reason.length, `${site} has no reason`).toBeGreaterThan(20);
    }
    expect(SYNCED).toContain('library');
  });
});
