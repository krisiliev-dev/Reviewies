import { describe, expect, it } from 'vitest';
import { blankLiterals, declarationOf, stripComments, stripMarkdownComments } from './source.ts';

/**
 * The helper every source-level guard now leans on, tested for the two mistakes it
 * exists to prevent. §6.72.
 */
describe('reading source as code', () => {
  it('removes a line comment', () => {
    expect(stripComments("// const c = createClient('u');\nconst x = 1;")).not.toContain(
      'createClient',
    );
  });

  it('removes a block comment', () => {
    expect(stripComments('/** Never call getConfig() up here. */\nconst x = 1;')).not.toContain(
      'getConfig',
    );
  });

  it('keeps the line numbering, so a match still points somewhere', () => {
    // A block comment collapses to the newlines it spanned rather than vanishing.
    const source = '/*\n a\n b\n*/\nconst x = 1;';
    expect(stripComments(source).split('\n')).toHaveLength(5);
  });

  it('leaves the code alone', () => {
    expect(stripComments("const c = createClient('u'); // like this")).toContain('createClient');
  });

  it('does not eat a URL, which is the classic way this goes wrong', () => {
    expect(stripComments("const u = 'https://example.com/x';")).toContain('example.com/x');
  });

  it('removes an HTML comment from Markdown', () => {
    expect(stripMarkdownComments('<!-- npm run nonsense -->\n`npm run real`')).not.toContain(
      'nonsense',
    );
  });

  it('leaves the Markdown alone', () => {
    expect(stripMarkdownComments('`npm run real`')).toContain('npm run real');
  });
});

describe('blanking every literal', () => {
  it('keeps a brace inside a string from ending a block', () => {
    const blanked = blankLiterals('function f() { const a = "}"; return a; }');
    expect(blanked.indexOf('}')).toBe(blanked.lastIndexOf('}'));
  });

  it('keeps a brace inside a regex character class from ending one either', () => {
    const blanked = blankLiterals('if (x) { const r = /[}]/; }');
    expect(blanked.split('}')).toHaveLength(2);
  });

  it('does not mistake division for a regex', () => {
    const blanked = blankLiterals('const half = total / 2; const rest = other / 3;');
    expect(blanked).toContain('total / 2');
    expect(blanked).toContain('other / 3');
  });

  it('leaves every character position where it was', () => {
    const source = 'const a = "hello";\nconst b = /world/;\n';
    const blanked = blankLiterals(source);
    expect(blanked).toHaveLength(source.length);
    expect(blanked.split('\n')).toHaveLength(source.split('\n').length);
  });

  it('blanks a template literal, including what it interpolates', () => {
    const blanked = blankLiterals('const s = `a${{ b: 1 }}c`;');
    expect(blanked).not.toContain('{');
  });

  it('does not eat the rest of a file after a URL', () => {
    // The same hazard `stripComments` has, in the other direction: `//` inside a string
    // is not a comment, and the string blanking must reach it first.
    const blanked = blankLiterals('const u = "https://example.com"; const kept = 1;');
    expect(blanked).toContain('const kept = 1');
  });
});

/**
 * The helper §6.109 wrote so that a clause stops asking whether a file mentions a thing.
 *
 * Every case here is a shape that actually defeated a guard in this repository, rather
 * than a shape it might: two style keys carrying the same value, a constant whose value
 * contains the needle a sibling also contains, and a value with a brace inside a string.
 */
describe('reading one declaration out of a file', () => {
  const SOURCE = `
const CHIP = 'rounded-plate min-h-11 text-s14';
const ROW = 'flex w-full min-h-11 text-left text-s14';
const styles = StyleSheet.create({
  label: { fontSize: CHOICE_SIZE.chips.label },
  tick: { color: theme.workingMark, fontSize: CHOICE_SIZE.chips.label },
  pattern: { content: '{ not a brace }' },
});
`;

  it('returns what a constant is set to, and not its neighbour', () => {
    expect(declarationOf(SOURCE, 'CHIP')).toContain('text-s14');
    expect(declarationOf(SOURCE, 'CHIP')).toContain('rounded-plate');
    expect(declarationOf(SOURCE, 'CHIP'), 'it ran into ROW').not.toContain('flex w-full');
  });

  it('tells two style keys apart when they hold the same value', () => {
    // The case that let a planted deletion pass: `toContain` on the file was satisfied by
    // `tick` after `label` had lost it.
    expect(declarationOf(SOURCE, 'label')).toContain('CHOICE_SIZE.chips.label');
    expect(declarationOf(SOURCE, 'label'), 'it swallowed tick').not.toContain('workingMark');
  });

  it('is not ended early by a brace inside a string', () => {
    expect(declarationOf(SOURCE, 'pattern')).toContain('{ not a brace }');
  });

  it('says nothing rather than something, when there is no such declaration', () => {
    // A needle that has stopped existing and one that has stopped matching are different
    // failures, and a clause should be able to tell them apart.
    expect(declarationOf(SOURCE, 'nothingCalledThis')).toBeUndefined();
  });
});
