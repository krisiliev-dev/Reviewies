import { describe, expect, it } from 'vitest';
import { EFFORT_LEVELS, filterByEffort, type Comment } from './comments';

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
});
