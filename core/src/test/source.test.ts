import { describe, expect, it } from 'vitest';
import { stripComments, stripMarkdownComments } from './source.ts';

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
