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
 * ## Why strings are not stripped
 *
 * A third way a text scan can be fooled: `const banned = 'new WebSocket('` reads as code
 * to a regular expression and as data to a compiler. §6.73 measured it rather than
 * guessing — the violation was placed inside a string literal for every guard, and five
 * fired: `dials`, `calendarDates`, `oneClient`, `runnable`, `backendQueries`.
 *
 * They stay that way, deliberately, for two reasons.
 *
 * The first is that stripping strings would blind the checks that *read* them. These
 * suites use strings as selectors and route names; `screenStates` asks whether a suite
 * names a screen, `commands` reads fenced shell lines, `copy` compares sentences. Take
 * the strings out and those stop working — a real loss traded for a hypothetical one.
 *
 * The second is the asymmetry. Every one of the five is a **false positive**, and on
 * input nobody writes: a source file that contains the literal text of a banned
 * construct without performing it. A false positive fails loudly, at the moment somebody
 * makes the edit, and is understood in a minute. A false negative — which is what
 * stripping too much would risk — is silent for a year. §6.72 spent a whole sprint on
 * exactly that difference.
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
