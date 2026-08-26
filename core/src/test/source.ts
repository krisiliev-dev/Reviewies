/**
 * Reading source as code rather than as prose.
 *
 * Every source-level guard in this repository matches raw text with a regular
 * expression, and each therefore has two ways to be wrong:
 *
 * - **A comment that mentions the thing** fails the build. Not hypothetical: every one
 *   of these guards carries a long explanation that quotes what it forbids, and §6.72
 *   found five that fired on their own prose — including `dials`, which had been
 *   worked around by excluding one file from the scan rather than by stripping.
 * - **A violation that is commented out** is still reported, or — far worse — a guard
 *   that checks for a *mention* is satisfied by one. §6.72 removed every real reference
 *   to the People screen from the web suite, left the word in a comment, and
 *   `screenStates` still said the suite rendered it.
 *
 * Eight guards had written their own version of this and five had none. One copy, so
 * the next guard inherits the answer instead of the question.
 *
 * It is deliberately not a parser. Brace-counting and regexes are enough to tell code
 * from prose, and a file that defeats them has bigger problems — the same reasoning
 * `injection.test.ts` gives for counting braces rather than building an AST.
 */

/**
 * Source with comments removed and their line structure kept.
 *
 * Block comments collapse to the newlines they spanned, so a match's line number still
 * means something. `(^|[^:])//` rather than `//` because `https://` is not a comment,
 * and a URL in a string is the most common thing this used to eat.
 */
export function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ''))
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/**
 * The same, for Markdown: HTML comments are the only kind it has.
 *
 * A README explains commands it does not want anybody to run, and `<!-- ... -->` is
 * how it says so.
 */
export function stripMarkdownComments(source: string): string {
  return source.replace(/<!--[\s\S]*?-->/g, (block) => block.replace(/[^\n]/g, ''));
}
