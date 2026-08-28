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

/**
 * Every comment, string, template and regex literal replaced by spaces, in place.
 *
 * `stripComments` is enough to stop a guard reading prose as code. Finding the *body* of
 * a test needs more than that: brace matching, and a brace inside a string or a regex
 * character class ends the block early. `/\{\s*\}/` and `` `${a}` `` both do it, and
 * §6.74's first attempt at counting assertions misread eleven files that way.
 *
 * Character positions are preserved — every removed character becomes a space, newlines
 * survive — so an offset into the result is an offset into the original, and a line
 * number still means something.
 *
 * This is deliberately not `stripComments`'s job. That one leaves strings alone on
 * purpose (see above); this one is for a caller that needs to find structure rather than
 * read text, and no guard should use both readings of the same file for the same claim.
 */
export function blankLiterals(source: string): string {
  const out = source.split('');
  const blank = (from: number, to: number) => {
    for (let k = from; k < to && k < out.length; k++) if (out[k] !== '\n') out[k] = ' ';
  };
  // What came just before, to tell a regex literal from a division sign.
  let previous = '';
  let i = 0;
  while (i < source.length) {
    const c = source[i];
    const two = source.slice(i, i + 2);
    if (two === '//') {
      const end = source.indexOf('\n', i);
      blank(i, end < 0 ? source.length : end);
      i = end < 0 ? source.length : end;
      continue;
    }
    if (two === '/*') {
      const end = source.indexOf('*/', i + 2);
      const stop = end < 0 ? source.length : end + 2;
      blank(i, stop);
      i = stop;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      while (j < source.length) {
        if (source[j] === '\\') {
          j += 2;
          continue;
        }
        if (source[j] === c) break;
        j++;
      }
      blank(i + 1, j);
      i = Math.min(j + 1, source.length);
      previous = 'x';
      continue;
    }
    // A `/` after a value is division; after an operator, a bracket or nothing, it opens
    // a regex. Getting this wrong in the safe direction only leaves text unblanked.
    if (c === '/' && /[=(,:[!&|?{};+\-*%<>~^]$|^$|\b(return|typeof)$/.test(previous)) {
      let j = i + 1;
      let inClass = false;
      let closed = false;
      while (j < source.length) {
        const d = source[j];
        if (d === '\\') {
          j += 2;
          continue;
        }
        if (d === '\n') break;
        if (d === '[') inClass = true;
        else if (d === ']') inClass = false;
        else if (d === '/' && !inClass) {
          closed = true;
          break;
        }
        j++;
      }
      if (closed) {
        blank(i + 1, j);
        i = j + 1;
        previous = 'x';
        continue;
      }
    }
    if (!/\s/.test(c)) previous = (previous + c).slice(-8);
    i++;
  }
  return out.join('');
}

/**
 * One named declaration, so a clause can judge the construct rather than the file.
 *
 * §6.109's sweep. A guard that reads a source file and asserts `toContain('text-s14')`
 * is answering "does this file mention it", and what it almost always means is "does
 * *this* constant carry it". The two come apart the moment a second occurrence exists —
 * measured, six clauses in this repository could not tell one from another, including
 * one that passed with the very thing it names deleted, because a sibling still had it.
 *
 * Takes the name of a `const`, an object key or a style key, and returns the text of what
 * it is set to. Structure is found on `blankLiterals`, so a brace inside a string or a
 * regex does not end the value early; the slice comes back out of the original text, so
 * what a clause reads is what is written.
 *
 * Returns `undefined` when there is no such declaration, which a clause should assert on
 * rather than swallow: a needle that has stopped existing and a needle that has stopped
 * matching are different failures.
 */
export function declarationOf(source: string, name: string): string | undefined {
  const structure = blankLiterals(source);
  const start = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*[:=]\\s*`)
    .exec(structure);
  if (!start) return undefined;
  let i = start.index + start[0].length;
  const OPEN = '{[(';
  const CLOSE = '}])';
  const stack: string[] = [];
  const from = i;
  for (; i < structure.length; i++) {
    const c = structure[i];
    if (OPEN.includes(c)) stack.push(CLOSE[OPEN.indexOf(c)]);
    else if (CLOSE.includes(c)) {
      if (!stack.length) break;
      if (stack[stack.length - 1] !== c) break;
      stack.pop();
      if (!stack.length) {
        i++;
        break;
      }
    } else if (!stack.length && (c === ',' || c === ';' || c === '\n')) {
      // A value that is not a bracketed expression ends at its own line or separator.
      if (source.slice(from, i).trim()) break;
    }
  }
  return source.slice(from, i);
}

/**
 * The style named `name` inside a file's `StyleSheet.create({...})`, and nowhere else.
 *
 * `declarationOf` takes the first `name:` or `name =` in the file, which is right until a
 * screen has both — `mobile/app/watching/[targetId].tsx` holds `const clock =
 * usePlaybackClock()` two hundred lines above `clock: { fontSize... }`, so a clause asking
 * for the style's face was handed a hook call and failed on a file that was correct.
 *
 * §6.109's rule, one layer along: a needle is only a needle if nothing else in the haystack
 * looks like it. Narrowing the haystack is the cheaper half of that.
 */
export function styleOf(source: string, name: string): string | undefined {
  const structure = blankLiterals(source);
  const at = structure.indexOf('StyleSheet.create(');
  if (at < 0) return undefined;
  return declarationOf(source.slice(at), name);
}
