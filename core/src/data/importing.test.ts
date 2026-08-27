import { beforeEach, describe, expect, it } from 'vitest';
import { activeImports, resetImports, subscribeToImports, whileImporting } from './importing.ts';

/** Reads better than `activeImports().length > 0` at every call site below. */
const importing = () => activeImports().length > 0;
import { importRescueCsv } from './tvtimeRescue.ts';
import { db } from './db.ts';

beforeEach(() => {
  resetImports();
});

describe('knowing an import is running', () => {
  it('says nothing is running before anything starts', () => {
    expect(importing()).toBe(false);
    expect(activeImports()).toEqual([]);
  });

  it('is true for the duration and false after', async () => {
    let during: boolean | undefined;
    const result = await whileImporting('a file', async () => {
      during = importing();
      return 'done';
    });
    expect(during).toBe(true);
    expect(result).toBe('done');
    expect(importing()).toBe(false);
  });

  /**
   * The failure case is the one that matters. A screen stuck on "still working" after
   * an import threw is worse than one that never said it — the person is waiting for
   * something that is not coming.
   */
  it('stops saying it is working when the import throws', async () => {
    await expect(
      whileImporting('a bad file', async () => {
        throw new Error('unreadable');
      }),
    ).rejects.toThrow('unreadable');
    expect(importing()).toBe(false);
    expect(activeImports()).toEqual([]);
  });

  /** An archive import runs the CSV importer inside itself. */
  it('survives one import running inside another', async () => {
    const seen: number[] = [];
    await whileImporting('outer', async () => {
      seen.push(activeImports().length);
      await whileImporting('inner', async () => {
        seen.push(activeImports().length);
      });
      seen.push(activeImports().length);
    });
    expect(seen).toEqual([1, 2, 1]);
    expect(importing()).toBe(false);
  });

  it('names what is being read, oldest first', async () => {
    await whileImporting('your TV Time export', async () => {
      await whileImporting('your phone backup', async () => {
        expect(activeImports().map((r) => r.source)).toEqual([
          'your TV Time export',
          'your phone backup',
        ]);
      });
    });
  });

  it('tells a listener when a run starts and when it ends', async () => {
    const states: boolean[] = [];
    const stop = subscribeToImports(() => states.push(importing()));
    await whileImporting('a file', async () => {});
    stop();
    expect(states).toEqual([true, false]);
  });

  it('stops telling a listener that has unsubscribed', async () => {
    let calls = 0;
    const stop = subscribeToImports(() => calls++);
    stop();
    await whileImporting('a file', async () => {});
    expect(calls).toBe(0);
  });

  /** A listener that removes itself while being notified used to mutate the set mid-loop. */
  it('survives a listener that unsubscribes itself while being told', async () => {
    let calls = 0;
    const stop = subscribeToImports(() => {
      calls++;
      stop();
    });
    await whileImporting('a file', async () => {});
    expect(calls).toBe(1);
  });
});

describe('the real importers announce themselves', () => {
  beforeEach(async () => {
    await db.library.clear();
    await db.watches.clear();
    await db.titles.clear();
  });

  /**
   * Not `whileImporting` in a test, but the function a screen actually calls. §6.80's
   * bug was that the wrapping did not exist at the call site anybody uses.
   */
  it('reports a rescue CSV import while it is running', async () => {
    const csv = [
      'show,season,number,name,seen,seen_date,times_watched,air_date,show_id,episode_id',
      'Dark,1,1,Secrets,True,2024-01-02 20:00:00,1,2024-01-02,1,11',
      'Dark,1,2,Lies,True,2024-01-03 20:00:00,1,2024-01-03,1,12',
    ].join('\n');

    const states: boolean[] = [];
    const stop = subscribeToImports(() => states.push(importing()));
    const report = await importRescueCsv(csv);
    stop();

    expect(report.watches).toBe(2);
    expect(states).toEqual([true, false]);
    expect(importing()).toBe(false);
  });
});
