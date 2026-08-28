import { describe, expect, it } from 'vitest';
import { splitFigure } from './data.ts';

/**
 * §6.112 put mono on the Stats tiles and the screenshot came back reading **`7  days`** —
 * the whole value in one `Text`, so a word was set at monospace letter spacing. Every case
 * here is a value one of the two Stats screens actually produces.
 */
describe('telling a figure from its unit', () => {
  it('leaves a value that is all figure alone', () => {
    for (const value of ['12', '6.0h', '0m', '2.4']) {
      expect(splitFigure(value), value).toEqual({ figure: value, unit: '' });
    }
  });

  it('splits the ones with a word after them', () => {
    expect(splitFigure('7 days')).toEqual({ figure: '7', unit: 'days' });
    expect(splitFigure('1 day')).toEqual({ figure: '1', unit: 'day' });
    expect(splitFigure('2.4 days')).toEqual({ figure: '2.4', unit: 'days' });
  });

  it('never sets prose in mono, even when nothing is a number', () => {
    // The direction asks for every *number* in tabular mono. A sentence is not a number,
    // and a value with none in it must come back as all unit rather than all figure.
    expect(splitFigure('no data')).toEqual({ figure: '', unit: 'no data' });
  });

  it('is what both Stats screens call, rather than each splitting its own way', () => {
    // The seam `Data` will formalise (component 6 of the roster). Until it exists, one
    // function — two regexes agreeing by hand is the thing this repository keeps finding.
    expect(splitFigure('7 days').figure).toBe(splitFigure(' 7 days ').figure);
  });
});
