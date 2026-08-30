import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  EFFORT_LEVELS,
  MAX_IMAGE_BYTES,
  commentBody,
  fetchComments,
  filterByEffort,
  uploadCommentImage,
  type Comment,
} from './comments.ts';
import * as auth from '../sync/auth.ts';

const make = (over: Partial<Comment> = {}): Comment => ({
  id: crypto.randomUUID(),
  userId: 'u1',
  body: 'x',
  createdAt: Date.now(),
  mine: false,
  ...over,
});

const ONE_LINER = make({ body: 'peak cinema' });
const REVIEW = make({
  body: 'The pacing in the back half finally earns the slow start, and the reveal recontextualises the whole cold open. '.repeat(
    2,
  ),
});

/**
 * The gate's three answers, and the branch that could not be reached.
 *
 * §6.175 read `gated: comments.length === 0 && !hasWatched` against two screens that render
 * `gated ? sealed : empty` only inside a `watched ?` branch, and concluded the sealed
 * sentence was unreachable. That was an argument, and §6.139 is that an argument about the
 * product is not a measurement of it — so this is the measurement, and it is what says the
 * §6.177 fix works rather than a paragraph saying so.
 *
 * `fetchComments` needs a client and a session, so both are stubbed. What is being checked
 * is the three-way decision, not Supabase.
 */
describe('whether an empty answer means empty or withheld', () => {
  const noRows = {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({ order: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }) }),
        }),
      }),
    }),
  };

  function stub() {
    vi.spyOn(auth, 'getClient').mockReturnValue(noRows as unknown as ReturnType<typeof auth.getClient>);
    vi.spyOn(auth, 'getSession').mockResolvedValue({
      user: { id: 'u1' },
    } as unknown as Awaited<ReturnType<typeof auth.getSession>>);
  }

  it('says withheld when the episode is unwatched', async () => {
    stub();
    expect((await fetchComments('e1', false, false)).gated).toBe(true);
  });

  it('says empty when it is watched and the server has heard', async () => {
    stub();
    // The invitation, not the status: nobody has said anything and that is the truth.
    expect((await fetchComments('e1', true, false)).gated).toBe(false);
  });

  it('says withheld when it is watched here and the write is still queued', async () => {
    stub();
    /*
     * The branch §6.175 proved unreachable. Before the third argument existed this
     * returned `false` — "Nothing here yet. Be the first." over a conversation the
     * server was deliberately withholding, which is the exact mistake
     * `COPY.comments.sealed` was written to prevent.
     *
     * It errs towards *sealed* on purpose: with a watch queued the client cannot tell an
     * empty conversation from a shut gate, and "try again in a moment" is true either
     * way while the write is outstanding.
     */
    expect((await fetchComments('e1', true, true)).gated).toBe(true);
  });
});

describe('effort filter', () => {
  it('keeps everything at level zero', () => {
    expect(filterByEffort([ONE_LINER, REVIEW], 0)).toHaveLength(2);
  });

  it('drops one-liners above the threshold', () => {
    const kept = filterByEffort([ONE_LINER, REVIEW], 80);
    expect(kept).toHaveLength(1);
    expect(kept[0].id).toBe(REVIEW.id);
  });

  it('never hides your own comments', () => {
    // Filtering away your own post makes the app look broken.
    const mine = make({ body: 'lol', mine: true });
    expect(filterByEffort([mine], 280)).toHaveLength(1);
  });

  it('keeps short comments that carry an image', () => {
    // A screenshot with a short caption is exactly what people liked about
    // TV Time's comments, so length alone is the wrong signal here.
    const screenshot = make({ body: 'HIS FACE', imageUrl: 'https://example.test/a.png' });
    expect(filterByEffort([screenshot], 280)).toHaveLength(1);
  });

  it('measures trimmed length, so padding with whitespace does not sneak through', () => {
    const padded = make({ body: `  short${' '.repeat(300)}  ` });
    expect(filterByEffort([padded], 80)).toHaveLength(0);
  });

  it('handles an empty list', () => {
    expect(filterByEffort([], 80)).toEqual([]);
  });

  it('offers escalating levels, least strict first', () => {
    const lengths = EFFORT_LEVELS.map((l) => l.minLength);
    expect(lengths).toEqual([...lengths].sort((a, b) => a - b));
    expect(lengths[0]).toBe(0);
  });

  /**
   * The threshold itself, which every fixture above is comfortably clear of.
   *
   * §6.76 changed `length >= minLength` to `>`, and moved 80 to 81 and 280 to 281, and
   * none of the seven tests here noticed: a one-liner is far below the bar and a review
   * far above it, so the bar could be anywhere between them.
   *
   * The numbers are pinned to their labels for the same reason `UPCOMING_DAYS` is pinned
   * to "the next two months" — "Skip one-liners" is a claim about roughly one line of
   * text, and a number that drifts away from its own label is how a filter stops meaning
   * what it says.
   */
  it('keeps a comment of exactly the minimum length, and not one character less', () => {
    const exactly = { ...ONE_LINER, body: 'x'.repeat(80) };
    const justUnder = { ...ONE_LINER, body: 'x'.repeat(79) };
    expect(filterByEffort([exactly], 80)).toHaveLength(1);
    expect(filterByEffort([justUnder], 80)).toHaveLength(0);
  });

  it('sets the bar at one line and at a paragraph', () => {
    expect(EFFORT_LEVELS.map((l) => [l.label, l.minLength])).toEqual([
      ['Everything', 0],
      ['Skip one-liners', 80],
      ['Proper reviews', 280],
    ]);
  });
});

describe('what gets stored as a comment body', () => {
  it('keeps what was typed', () => {
    expect(commentBody('  That ending.  ')).toBe('That ending.');
  });

  it('lets a screenshot stand alone', () => {
    // Most of what people posted on TV Time was a picture with no words, but
    // comments.body is not null with a length check — so it needs something.
    expect(commentBody('', 'https://example.test/a.png')).toBe('📷');
  });

  it('prefers real words over the placeholder', () => {
    expect(commentBody('look at this', 'https://example.test/a.png')).toBe('look at this');
  });

  it('rejects an empty comment with no image', () => {
    expect(commentBody('   ')).toBe('');
  });
});

describe('attaching a screenshot, from either platform', () => {
  /** Captures the multipart body the edge function would receive. */
  function stubClient() {
    const sent: FormData[] = [];
    vi.spyOn(auth, 'getSession').mockResolvedValue({ user: { id: 'u1' } } as never);
    vi.spyOn(auth, 'getClient').mockReturnValue({
      functions: {
        invoke: async (_name: string, options: { body: FormData }) => {
          sent.push(options.body);
          return { data: { url: 'https://example.test/i.png' }, error: null };
        },
      },
    } as never);
    return sent;
  }

  afterEach(() => vi.restoreAllMocks());

  it('sends a browser File as the file part', async () => {
    const sent = stubClient();
    const file = new File([new Uint8Array([1, 2, 3])], 'shot.png', { type: 'image/png' });

    const result = await uploadCommentImage({ part: file, type: file.type, size: file.size });

    expect(result).toEqual({ ok: true, url: 'https://example.test/i.png' });
    expect(sent[0].get('file')).toBe(file);
  });

  it('sends React Native’s uri object through untouched', async () => {
    // The phone has no `File`. Its FormData takes `{ uri, name, type }` and its runtime
    // reads the bytes off disk — so this has to reach `append` as the object it is.
    // Asserted at `append` rather than by reading the entry back, because jsdom's
    // FormData stringifies a plain object to "[object Object]" on the way in and there
    // would be nothing left to recognise.
    stubClient();
    const appended: unknown[] = [];
    const append = vi
      .spyOn(FormData.prototype, 'append')
      .mockImplementation((...args: unknown[]) => void appended.push(args[1]));

    const part = { uri: 'file:///tmp/shot.jpg', name: 'shot.jpg', type: 'image/jpeg' };
    const result = await uploadCommentImage({ part, type: 'image/jpeg', size: 4096 });
    append.mockRestore();

    expect(result.ok).toBe(true);
    expect(appended).toEqual([part]);
    expect(appended[0]).toBe(part);
  });

  it('refuses a type the bucket does not allow, before spending the upload', async () => {
    const sent = stubClient();

    const result = await uploadCommentImage({ part: {}, type: 'image/heic', size: 100 });

    expect(result).toEqual({ ok: false, reason: 'Images only — JPEG, PNG, WebP or GIF.' });
    expect(sent).toHaveLength(0);
  });

  it('refuses one over the size the function will accept', async () => {
    const sent = stubClient();

    const result = await uploadCommentImage({
      part: {},
      type: 'image/png',
      size: MAX_IMAGE_BYTES + 1,
    });

    expect(result).toEqual({ ok: false, reason: 'That image is over 5 MB.' });
    expect(sent).toHaveLength(0);
  });

  it('refuses an empty one, which a picker can hand back', async () => {
    const sent = stubClient();

    const result = await uploadCommentImage({ part: {}, type: 'image/png', size: 0 });

    expect(result).toEqual({ ok: false, reason: 'That file is empty.' });
    expect(sent).toHaveLength(0);
  });
});
