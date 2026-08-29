/**
 * Where a TMDB answer is filed in the snapshot.
 *
 * Its own module because both halves need it and neither should run the other: importing
 * `snapshot.mjs` for one function ran the whole snapshot — 79 API calls and a hundred
 * megabytes — as a side effect of starting the server. A script is not a library, and the
 * shared part of one is.
 *
 * Parameters **sorted**, so the key does not depend on the order a caller happened to build
 * its object in. The provider and the snapshot write the same two parameters today and
 * there is no reason for that to keep being true.
 */
export function queryKey(path, params = {}) {
  const entries = Object.entries(params).sort(([a], [b]) => a.localeCompare(b));
  const query = new URLSearchParams(entries).toString();
  return query ? `api${path}__${query}.json` : `api${path}.json`;
}
