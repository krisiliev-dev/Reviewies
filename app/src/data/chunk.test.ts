import { describe, expect, it, beforeEach } from 'vitest';
import { COPY } from '@reviewies/core/copy';
import { onFailure, resetFailures } from '@reviewies/core/data/failure';
import { loadChunk } from './chunk';

/**
 * A tab open across a deployment, in miniature.
 *
 * §6.65 produced the real thing in a browser: the page keeps running the build it loaded
 * with, its lazy imports name files that are gone, and a host that rewrites unknown paths
 * to the app shell answers with `200 text/html`. What the browser then says is "Failed to
 * fetch dynamically imported module", which is true and useless.
 */
describe('loading a chunk that is no longer there', () => {
  beforeEach(resetFailures);

  it('turns a failed import into the sentence that has an answer', async () => {
    const heard: string[] = [];
    onFailure((f) => heard.push(f.message));

    const result = await loadChunk(async () => {
      throw new TypeError('Failed to fetch dynamically imported module: /assets/x-abc.js');
    });

    expect(result).toBeUndefined();
    expect(heard).toEqual([COPY.app.updated]);
  });

  it('recognises the MIME shape of it too', async () => {
    // Safari and Firefox word it differently, and the shell-instead-of-a-module case
    // arrives as a MIME complaint rather than a fetch failure.
    const heard: string[] = [];
    onFailure((f) => heard.push(f.message));

    await loadChunk(async () => {
      throw new TypeError(
        'Expected a JavaScript module script but the server responded with a MIME type of "text/html"',
      );
    });

    expect(heard).toEqual([COPY.app.updated]);
  });

  it('does not swallow a chunk’s own error', async () => {
    // A module that loads and then throws is a bug in that module, and dressing it up as
    // "the app has updated" would send somebody to reload for ever.
    const heard: string[] = [];
    onFailure((f) => heard.push(f.message));

    await expect(
      loadChunk(async () => {
        throw new Error('boom, inside the module');
      }),
    ).rejects.toThrow('boom');
    expect(heard).toEqual([]);
  });

  it('returns what it loaded when nothing is wrong', async () => {
    expect(await loadChunk(async () => ({ hello: 'there' }))).toEqual({ hello: 'there' });
  });
});
