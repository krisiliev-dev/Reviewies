import { describe, expect, it } from 'vitest';
import { labelFor, summarise } from './announce.ts';

/**
 * What the stream says out loud, and how often.
 *
 * The failure it replaced was announcing every reaction: twenty-four interruptions a
 * minute at the default density, on a screen someone is holding while watching
 * television. The failure it must not become is announcing nothing — that is as easy to
 * ship by accident, and it would quietly remove the feature for the people it is worth
 * most to.
 */
describe('naming an emoji', () => {
  it('uses the word a person would say', () => {
    // "Funny", not "face with tears of joy".
    expect(labelFor('😂')).toBe('funny');
    expect(labelFor('😱')).toBe('scared');
  });

  it('sees past a variation selector', () => {
    // ❤️ and ❤ are the same reaction and would otherwise be counted apart.
    expect(labelFor('❤️')).toBe('love');
    expect(labelFor('❤')).toBe('love');
  });
});

describe('summarising a moment', () => {
  it('says nothing about nothing', () => {
    expect(summarise([])).toBe('');
  });

  it('names them when they agree', () => {
    expect(summarise(['😂', '😂', '😂'])).toBe('3 funny');
  });

  it('names the one that led and counts the rest', () => {
    // What matters about a moment is rarely which emoji won — it is that several people
    // reacted at once.
    expect(summarise(['😂', '😂', '😱'])).toBe('2 funny and 1 other');
  });

  it('counts what it cannot name rather than inventing a word', () => {
    const said = summarise(['🫥', '🫥']);
    expect(said).toMatch(/^2 /);
    expect(said).not.toContain('undefined');
  });

  it('reads as English for one', () => {
    expect(summarise(['😂'])).toBe('1 funny');
    expect(summarise(['😂', '😱'])).toBe('1 funny and 1 other');
  });
});
