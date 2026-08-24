import { describe, expect, it } from 'vitest';
import { EMOJI_PAD, searchEmoji } from './emoji';

describe('emoji search', () => {
  it('returns nothing for an empty query', () => {
    expect(searchEmoji('')).toEqual([]);
  });

  it('matches on label', () => {
    expect(searchEmoji('cliff')[0].emoji).toBe('🧗');
  });

  it('matches on keyword rather than only the visible label', () => {
    expect(searchEmoji('twist')[0].emoji).toBe('🤯');
  });

  it('ranks exact label matches above partial ones', () => {
    expect(searchEmoji('love')[0].label).toBe('Love');
  });

  it('is case insensitive', () => {
    expect(searchEmoji('FUNNY')[0].emoji).toBe('😂');
  });

  it('passes through a pasted emoji even if we do not know it', () => {
    const results = searchEmoji('🦩');
    expect(results[0].emoji).toBe('🦩');
  });

  it('includes thumbs up and down on the default pad as permanent fixtures', () => {
    const emojis = EMOJI_PAD.map((e) => e.emoji);
    expect(emojis).toContain('👍');
    expect(emojis).toContain('👎');
  });

  it('returns an empty list for nonsense rather than throwing', () => {
    expect(searchEmoji('zzzqqq')).toEqual([]);
  });
});
