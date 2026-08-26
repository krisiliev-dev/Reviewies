import { COPY } from '@reviewies/core/copy';
import { reportFailure } from '@reviewies/core/data/failure';

/**
 * Load a chunk that the running build asks for by name, and say something useful when
 * the name no longer exists.
 *
 * A tab left open across a deployment is running code whose files have been replaced. Its
 * lazy imports are requests for hashed filenames that are gone — and on a host that
 * rewrites unknown paths to the app shell, the answer is `200 text/html`, so the browser
 * reports "Failed to fetch dynamically imported module" and the person is told nothing at
 * all. §6.65 produced exactly that, twice, in a real browser.
 *
 * The server side of it is fixed separately (`vercel.json` no longer rewrites `/assets/`,
 * so a missing chunk is an honest 404). This is the half the person sees: the app says it
 * has been updated and offers the reload that fixes it.
 */
export async function loadChunk<T>(load: () => Promise<T>): Promise<T | undefined> {
  try {
    return await load();
  } catch (error) {
    // A failed *import* is the update case; anything else is the chunk's own problem and
    // is reported as itself.
    const message = String(error);
    if (/dynamically imported module|Importing a module script failed|MIME type/i.test(message)) {
      reportFailure(new Error(COPY.app.updated));
      return undefined;
    }
    throw error;
  }
}
