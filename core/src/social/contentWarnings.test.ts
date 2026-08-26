import { describe, expect, it } from 'vitest';
import {
  CONTENT_WARNINGS,
  describeVotes,
  summariseWarnings,
  warningLabel,
  type WarningVotes,
} from './contentWarnings.ts';

const votes = (warning: string, yesVotes: number, noVotes: number): WarningVotes => ({
  warning,
  yesVotes,
  noVotes,
});

describe('vocabulary', () => {
  it('gives every warning a plain-language label', () => {
    for (const w of CONTENT_WARNINGS) {
      expect(w.label.length).toBeGreaterThan(0);
      expect(warningLabel(w.id)).toBe(w.label);
    }
  });

  it('falls back to the raw id rather than rendering nothing', () => {
    // The database vocabulary could gain a value before this table does; showing the
    // slug is ugly but honest, whereas an empty row would look like a bug.
    expect(warningLabel('something-new')).toBe('something-new');
  });
});

describe('verdicts', () => {
  it('treats an unopposed flag as confirmed', () => {
    expect(summariseWarnings([votes('animal-harm', 3, 0)])[0].verdict).toBe('yes');
  });

  it('treats an argued-down flag as absent', () => {
    expect(summariseWarnings([votes('animal-harm', 0, 3)])[0].verdict).toBe('no');
  });

  it('calls a real disagreement contested rather than picking a side', () => {
    expect(summariseWarnings([votes('gore', 3, 2)])[0].verdict).toBe('contested');
  });

  it('does not let one outlier make a settled warning look contested', () => {
    // 1 in 10 is noise; treating it as a dispute would make every popular title
    // permanently ambiguous.
    expect(summariseWarnings([votes('gore', 9, 1)])[0].verdict).toBe('yes');
  });

  /**
   * Exactly a quarter, and exactly even.
   *
   * §6.76 moved the contested threshold from "at least a quarter" to "more than a
   * quarter" and let a tied vote read as confirmed, and neither change failed anything.
   * The fixtures above are 3-2 (40%) and 9-1 (10%), comfortably either side.
   *
   * The tie is the one that matters to somebody reading it. Four people say a show has
   * this in it and four say it does not; calling that a confirmed warning is picking a
   * side, and the word for it is already in the vocabulary.
   *
   * The `yesVotes > noVotes` below it survives mutation to `>=` and always will: an even
   * split is half the votes in the minority, so the contested branch has already claimed
   * it. Equality is unreachable there, which is why the test asserts the verdict rather
   * than the comparison.
   */
  it('is contested at exactly a quarter, and settled just under', () => {
    expect(summariseWarnings([votes('gore', 3, 1)])[0].verdict).toBe('contested');
    // 1 in 5 is under the bar; 1 in 4 is on it.
    expect(summariseWarnings([votes('gore', 4, 1)])[0].verdict).toBe('yes');
  });

  it('never calls an evenly split vote confirmed', () => {
    expect(summariseWarnings([votes('gore', 4, 4)])[0].verdict).toBe('contested');
    expect(summariseWarnings([votes('gore', 1, 1)])[0].verdict).toBe('contested');
  });

  it('marks a lone vote as such', () => {
    const [only] = summariseWarnings([votes('vomit', 1, 0)]);
    expect(only.verdict).toBe('yes');
    // One stranger's click must not read as an established fact.
    expect(only.singleVote).toBe(true);
  });

  it('stops marking it once someone else agrees', () => {
    expect(summariseWarnings([votes('vomit', 2, 0)])[0].singleVote).toBe(false);
  });
});

describe('ordering', () => {
  it('puts confirmed warnings first and argued-down ones last', () => {
    const order = summariseWarnings([
      votes('vomit', 0, 4),
      votes('gore', 3, 2),
      votes('suicide', 5, 0),
    ]).map((s) => s.warning);

    expect(order).toEqual(['suicide', 'gore', 'vomit']);
  });

  it('ranks equally confident warnings by how many people weighed in', () => {
    const order = summariseWarnings([votes('gore', 2, 0), votes('suicide', 8, 0)]).map(
      (s) => s.warning,
    );
    expect(order).toEqual(['suicide', 'gore']);
  });

  it('keeps a disputed warning visible instead of dropping it', () => {
    // Silently hiding a contested warning is the failure mode that matters: someone
    // who needs it never learns it was ever raised.
    expect(summariseWarnings([votes('animal-harm', 1, 1)])).toHaveLength(1);
  });

  it('ignores a row nobody actually voted on', () => {
    expect(summariseWarnings([votes('gore', 0, 0)])).toHaveLength(0);
  });
});

describe('vote descriptions', () => {
  const summarise = (y: number, n: number) => describeVotes(summariseWarnings([votes('gore', y, n)])[0]);

  it('reads naturally for one voter', () => {
    expect(summarise(1, 0)).toBe('1 says yes');
  });

  it('reads naturally for several', () => {
    expect(summarise(4, 0)).toBe('4 say yes');
  });

  it('shows both sides when there are two', () => {
    expect(summarise(3, 2)).toBe('3 say yes · 2 say no');
  });

  it('does not mention a side nobody took', () => {
    expect(summarise(0, 2)).toBe('2 say no');
  });
});
