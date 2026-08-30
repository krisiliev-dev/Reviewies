import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { fromDisk, fromGitRef } from './coreWiring';
import { paletteNames, unpainted } from './paletteMembers';

/**
 * A colour with a name, a meaning, a measured ratio and nothing that paints it.
 *
 * The sixth of these to be found by reading rather than by a test — after `ratio.poster`
 * (§6.118), heading depth (§6.120), `elevation` (§6.122), the light table, and the dim
 * palette this was written for. Three of them turned out to be sitting on a real defect; the
 * row poster had been two points off the ratio it named for as long as it had been unread.
 *
 * `coreWiring` is the guard for this shape one level up and structurally cannot see it here:
 * it works at export granularity, `color` is exported and reached, and a dead member of a
 * live export is invisible to it. `paletteMembers.ts` has the reasoning for scanning colours
 * rather than the whole table, and for keeping string literals where `coreWiring` blanks
 * them.
 *
 * Like that file this is deliberately a list of exceptions rather than a clever rule. Every
 * entry is a decision somebody made, written down, and an entry whose condition stops being
 * true has to come out.
 */
const ROOT = resolve(__dirname, '../../..');

/**
 * In the table, painted by nothing, and that is correct — for now.
 *
 * Two, and both are the unused half of a pair whose other half ships. That is the only
 * reason this list accepts, because it is the only one that is a *fact about the palette*
 * rather than a plan: `troubleOn` cannot be painted until something paints `trouble` as a
 * fill, and asking for it to be deleted would be asking for the pair to be taken apart.
 *
 * "The migration has not reached this sprint" is explicitly not accepted here, and that is
 * the difference between this list and an allowlist of its own violations. A colour that is
 * waiting for a screen is a colour whose meaning nothing is keeping true, which is the
 * condition this file exists to fail on.
 */
const UNPAINTED: Record<string, string> = {
  strokeEmphasis:
    'The second step of the depth system, and the half of it nothing has needed: every rule in both apps is `strokeHairline`, and the one place that wanted something stronger wanted a *state*, which is `strokeSignal` and is aliased to the tertiary ink so it clears 1.4.11. It is not waiting for a screen — `contrast.test.ts` pins it BELOW 3.0 on purpose, so that promoting a separator into a meaning-bearing mark fails there rather than passing quietly. A decoration deliberately held under the floor is the one kind of colour whose job can be done without being painted.',
  troubleOn:
    'The label that goes on a `trouble` fill, and nothing fills with `trouble` yet — red is a word and a mark in this build, never a plate. It is here rather than deleted because it is one half of a pair: `contrast.test.ts` reads the two together to assert the label clears 4.5 on its own fill, which is a property of `trouble` that cannot be stated without it. `actionLabel`/`actionFill` and `workingOnFill`/`workingFill` are the same shape and both are painted, which is what makes this one the exception rather than the rule.',
};

describe('every colour in the table, and what paints with it', () => {
  const tree = fromDisk(ROOT);

  it('finds the palette it is meant to be scanning', () => {
    // A scan that silently matched nothing would pass everything below it.
    expect(paletteNames(tree.read('core/src/tokens.ts')).length).toBeGreaterThan(18);
  });

  it('has no colour nothing paints with', () => {
    expect(unpainted(tree).filter((name) => !(name in UNPAINTED))).toEqual([]);
  });

  it('does not keep reasons that have stopped being true', () => {
    // The same clause `coreWiring` carries, and for the same reason: an excuse that
    // outlives the condition it describes is the §6.59 shape. An entry drops out of `live`
    // either because the colour was deleted or because something finally started painting
    // with it, and either way the sentence here has to go.
    const live = new Set(unpainted(tree));
    expect(Object.keys(UNPAINTED).filter((name) => !live.has(name))).toEqual([]);
  });
});

describe('pointed at the commit before the dim palette was deleted', () => {
  /**
   * The check, checked.
   *
   * `coreWiring` aims its own scan at `c2aa930^` — the last commit where the phone could not
   * sync — on the argument that a guard for a class of bug which has never been shown to
   * catch one is a guess. This is that clause for this scan, and it is also the plant made
   * permanent: 59b5d8d is the last commit where the three dim roles were in both tables with
   * nothing painting them, and the whole suite was green on it. If this stops finding them,
   * the scan has stopped looking and everything above it is decoration.
   */
  const BEFORE_THE_DIM_PALETTE_WENT = '59b5d8d';

  /** Reading a whole tree out of git history, at `coreWiring`'s budget and for its reason. */
  const READING_HISTORY_IS_SLOW = 30_000;

  it('finds the three colours six sprints of green did not', () => {
    let dead;
    try {
      dead = unpainted(fromGitRef(ROOT, BEFORE_THE_DIM_PALETTE_WENT));
    } catch {
      // A shallow clone has no history to point at. Say so rather than passing quietly.
      throw new Error(
        `Could not read ${BEFORE_THE_DIM_PALETTE_WENT}. This check needs the repository history.`,
      );
    }

    expect(dead).toContain('dimInk');
    expect(dead).toContain('dimInkSecondary');
    expect(dead).toContain('dimWorking');
  }, READING_HISTORY_IS_SLOW);
});
