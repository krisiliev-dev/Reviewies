import { describe, expect, it } from 'vitest';
import { describeMix, type ListItem } from './lists';

const item = (kind: 'show' | 'film', titleId = Math.random().toString()): ListItem => ({
  titleId,
  kind,
  rank: 0,
});

describe('list mix description', () => {
  it('describes an empty list', () => {
    expect(describeMix([])).toBe('Empty');
  });

  it('describes a series-only list', () => {
    expect(describeMix([item('show'), item('show')])).toBe('2 series');
  });

  it('describes a film-only list', () => {
    expect(describeMix([item('film')])).toBe('1 film');
  });

  it('spells out a mixed list, since mixing is the point', () => {
    // A half-film list should say so rather than looking like a broken TV list.
    expect(describeMix([item('show'), item('film'), item('film')])).toBe('1 series · 2 films');
  });
});
