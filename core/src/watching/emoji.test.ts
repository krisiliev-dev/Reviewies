import { describe, expect, it } from 'vitest';
import { EMOJI_PAD, loadEmojiIndex, searchEmoji } from './emoji.ts';

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

  it('finds emoji nowhere near a television, because the brief said any', async () => {
    await loadEmojiIndex();
    // "Any emojis can be used by simply searching in the search bar." For a while this
    // searched thirty-two, so none of these existed as far as the app was concerned.
    for (const [query, expected] of [
      ['taco', '🌮'],
      ['rocket', '🚀'],
      ['penguin', '🐧'],
      ['umbrella', '☂️'],
      ['saxophone', '🎷'],
    ]) {
      const found = searchEmoji(query).map((e) => e.emoji);
      expect(found, `searching "${query}"`).toContain(expected);
    }
  });

  it('still puts the television ones first when both match', async () => {
    await loadEmojiIndex();
    // Someone typing "eyes" part-way through an episode means 👀, not one of the dozen
    // other emoji Unicode files under that word.
    expect(searchEmoji('eyes')[0].emoji).toBe('👀');
    expect(searchEmoji('fire')[0].emoji).toBe('🔥');
    expect(searchEmoji('thumbs up')[0].emoji).toBe('👍');
  });

  it('finds things by the word people would type, not only the official name', async () => {
    await loadEmojiIndex();
    // Unicode calls 🙄 "face with rolling eyes", which nobody types.
    expect(searchEmoji('eye roll').map((e) => e.emoji)).toContain('🙄');
    expect(searchEmoji('lol').map((e) => e.emoji)).toContain('😂');
  });

  it('never offers the same emoji twice under different spellings', async () => {
    await loadEmojiIndex();
    // U+FE0F asks for a colourful glyph, and whether an emoji carries it depends on
    // where the data came from — the index spells thumbs-up as one and the pad as the
    // other. Identical on screen, different strings, and a reaction is stored as its
    // string: two entries nobody could tell apart, splitting the crowd's count for a
    // moment between them.
    for (const query of ['thumbs', 'heart', 'eyes', 'fire', 'star']) {
      const seen = new Set<string>();
      for (const found of searchEmoji(query, 20)) {
        const bare = found.emoji.replace(/\uFE0F/g, '');
        expect(seen.has(bare), `${query} offered ${found.emoji} twice`).toBe(false);
        seen.add(bare);
      }
    }
  });

  it('stays bounded, so the pad cannot be flooded', () => {
    // "a" matches hundreds of labels; the screen shows a grid, not a scroll of Unicode.
    expect(searchEmoji('a').length).toBeLessThanOrEqual(20);
    expect(searchEmoji('a', 8)).toHaveLength(8);
  });

  it('answers fast enough to type into', () => {
    // Including the first call, which parses the whole index. This runs on a phone in a
    // dark room part-way through an episode.
    const started = Date.now();
    for (const q of ['ta', 'tac', 'taco', 'r', 'ro', 'roc']) searchEmoji(q);
    expect(Date.now() - started).toBeLessThan(500);
  });
});
