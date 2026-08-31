import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { queryKey } from './tmdbKey.mjs';

/**
 * A snapshot of real TMDB, taken with node and served to the browser from localhost.
 *
 * ## Why this exists
 *
 * Every screenshot this project has ever taken is of invented data. `FixtureProvider`'s
 * five titles are two or three short words; every episode is named `Episode {n}`; every
 * overview is one sentence; and it supplies **no `posterUrl` at all**, so every poster in
 * the entire design record is the two-letter fallback. The artwork path — on screens whose
 * own comments say "recognising a show by its artwork is most of what these screens are
 * for" — has never been photographed.
 *
 * The token to fix that has been in `.env` the whole time, and all three design scripts
 * blank it. That was a real decision, for determinism: the harness asserts specific titles,
 * and live data changes under it. It justified keeping a fixture pass. It never justified
 * having only one.
 *
 * ## Why a snapshot rather than a live pass
 *
 * Measured: **Chromium in this container has no outbound network at all.** `example.com`
 * and `registry.npmjs.org` fail with `ERR_CONNECTION_RESET` exactly as TMDB does, through
 * the proxy and without it, with certificate errors ignored. Node reaches all three. So the
 * only shape available is: fetch with node, keep it, serve it from localhost, and point the
 * app at localhost with `tmdbBase` / `tmdbImage`.
 *
 * That is better than a live pass in the way that matters here — it is **deterministic**,
 * which is the property the token was being blanked for. A snapshot changes when somebody
 * re-takes it, and never between two runs of the harness.
 *
 * ## The library, and why these
 *
 * Chosen for what they stress rather than for taste. Each line says which.
 */
const LIBRARY = [
  // The longest title anybody actually tracks, and seventeen seasons of it. Every screen
  // in this product truncates or wraps a title somewhere; none has ever been given one.
  { query: "It's Always Sunny in Philadelphia", kind: 'tv' },
  // The anime case the fixture *invents* with a 96-episode block: continuous numbering
  // over a thousand episodes, which is the real shape `direction.md` names.
  // Pinned by id: `search/multi` answers "One Piece" with the 2023 live-action series,
  // which is three seasons. The anime is 37854 and is the shape being asked for.
  { query: 'One Piece', kind: 'tv', id: 37854 },
  // Airing now, with real episode names — the thing `episodeName` was written for and has
  // never seen a genuine example of.
  { query: 'Severance', kind: 'tv' },
  // A season at a time, which is §6.149's `drop` cadence against a show that really does it.
  { query: 'The Bear', kind: 'tv' },
  // A diacritic in the title and real episode names. `on-a-device.md` §4 asks what happens
  // to a face that is not Archivo; this is the nearest a container can get to asking.
  { query: 'Shōgun', kind: 'tv' },
  // A film, and a long one, for the rows that mix kinds.
  { query: 'Everything Everywhere All at Once', kind: 'movie' },
];

const OUT = new URL('./real/', import.meta.url).pathname;

/**
 * The token, read from `.env` and never printed.
 *
 * Not passed on a command line either: an argument is visible in `ps` to anything on the
 * machine, which is the shape of leak this project has already had to rotate a key for.
 */
function token() {
  const path = new URL('../.env', import.meta.url).pathname;
  if (!existsSync(path)) throw new Error('No .env, so there is no token to take a snapshot with.');
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const at = line.indexOf('=');
    if (at > 0 && line.slice(0, at).trim() === 'VITE_TMDB_TOKEN') return line.slice(at + 1).trim();
  }
  throw new Error('VITE_TMDB_TOKEN is not in .env.');
}

const AUTH = { Authorization: `Bearer ${token()}`, accept: 'application/json' };

/** Write a file, making its directory. */
function put(relative, body) {
  const path = join(OUT, relative);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, body);
}

let calls = 0;
async function api(path, params = {}) {
  const url = new URL('https://api.themoviedb.org/3' + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, { headers: AUTH });
  calls++;
  if (!res.ok) throw new Error(`${path} → HTTP ${res.status}`);
  const json = await res.json();
  collectAll(json);
  /*
   * Keyed by the path *and* the query, because `/search/multi?query=x` and `?query=y` are
   * two answers at one path. The server reads the same key back.
   */
  const key = queryKey(path, params);
  put(key, JSON.stringify(json));
  return json;
}

const images = new Set();
const collect = (path) => {
  if (path) images.add(path);
};

/**
 * Every image path in a response, wherever it sits.
 *
 * Collecting only the chosen title's artwork left the search screen — twenty results, each
 * with a poster — and every recommendation drawing the two-letter fallback, which is
 * precisely the thing this whole pass exists to stop photographing. A response is a tree
 * and the paths are all over it; walking it is one function and no judgement.
 */
function collectAll(value) {
  if (Array.isArray(value)) return value.forEach(collectAll);
  if (!value || typeof value !== 'object') return;
  for (const [key, v] of Object.entries(value)) {
    if (/_path$/.test(key) && typeof v === 'string') collect(v);
    else collectAll(v);
  }
}

async function snapshotTitle({ query, kind, id }) {
  const search = await api('/search/multi', { query, include_adult: 'false' });
  const results = (search.results ?? []).filter((r) => r.media_type === kind);
  const hit = id ? results.find((r) => r.id === id) ?? { id } : results[0];
  if (!hit) throw new Error(`No ${kind} called "${query}" came back.`);
  collect(hit.poster_path);

  /*
   * The **exact** parameters `TmdbProvider` sends, and the bare path it also asks for.
   *
   * The first run of this snapshotted `append_to_response=external_ids,content_ratings,
   * release_dates` because that is what a person would fetch if they were being thorough,
   * and the provider asks for `external_ids` alone — a different key, so a different file,
   * so a 404. A snapshot is not a copy of the data; it is a copy of the *questions*, and
   * asking a better one is asking a different one. §6.151.
   */
  const detail = await api(`/${kind}/${hit.id}`, { append_to_response: 'external_ids' });
  // `getEpisodes` asks again with no parameters, to enumerate seasons.
  await api(`/${kind}/${hit.id}`);
  const name = detail.name ?? detail.title;
  collect(detail.poster_path);
  collect(detail.backdrop_path);
  await api(`/${kind}/${hit.id}/watch/providers`);
  await api(`/${kind}/${hit.id}/recommendations`);

  let episodes = 0;
  if (kind === 'tv') {
    /*
     * Every season, because that is what `getEpisodes` asks for — and One Piece has
     * twenty-two of them, which is the point. A snapshot that skipped seasons would be a
     * fixture again, just a better-dressed one.
     */
    for (const s of detail.seasons ?? []) {
      const season = await api(`/tv/${hit.id}/season/${s.season_number}`);
      episodes += (season.episodes ?? []).length;
      for (const e of season.episodes ?? []) collect(e.still_path);
    }
  }
  console.log(`  ${name} — ${kind}, ${detail.seasons?.length ?? 0} season(s), ${episodes} episodes`);
  return { name, id: hit.id, kind, episodes };
}

console.log('Taking a snapshot of real TMDB. Nothing here is invented.');
const taken = [];
for (const entry of LIBRARY) taken.push(await snapshotTitle(entry));

await api('/trending/all/week');
await api('/configuration');

/*
 * The genre table, which is two responses and the second fact on every box.
 *
 * `TmdbProvider.genres()` fetches these once per provider and keeps the id → name map for
 * its life, because a **list** endpoint answers with `genre_ids: [18, 10765]` and only this
 * table turns those into words. It was missing here for as long as this file has existed,
 * and nothing said so: the provider is written to treat a failure here as *not* a search
 * failure, so it swallows the 404s, hands back an empty map, and every result carries no
 * genres at all.
 *
 * What that cost is a hole neither design pass could show alone. `boxUnder` composes the
 * line under a box's title as genre, then year — `core/src/ui/box.ts` argues for those being
 * the two facts a spine carries besides the name. The fixture pass photographs *Drama · 2024*
 * under a blank monogram plate, because `FixtureProvider` invents genres and no artwork; this
 * pass photographs a real poster under *2001*, because it has the artwork and no genres. Two
 * passes, thirty sprints, and a box carrying both has never been photographed.
 *
 * The lesson is this file's own, one altitude up. §6.151 wrote that a snapshot is a copy of
 * the **questions** rather than of the data, about a query key that did not match. The same
 * sentence covers a question that was never asked at all — and that one is quieter, because
 * a wrong key 404s on a screen somebody is looking at, while a missing endpoint the provider
 * degrades around simply draws a slightly emptier screen for ever.
 */
await api('/genre/tv/list');
await api('/genre/movie/list');

/*
 * And the artwork, which is the half of this that the fixture cannot fake at all. Three
 * sizes, because `poster`, `backdrop` and `still` each ask for a different one and a
 * screenshot of the wrong size is a screenshot of a different design.
 */
let bytes = 0;
for (const path of images) {
  for (const size of ['w342', 'w780', 'w300']) {
    // Kept, so a re-take costs the API calls and not thirty-five megabytes again.
    if (existsSync(join(OUT, 't/p', size, path))) continue;
    const res = await fetch(`https://image.tmdb.org/t/p/${size}${path}`);
    if (!res.ok) continue;
    const body = Buffer.from(await res.arrayBuffer());
    bytes += body.length;
    put(join('t/p', size, path), body);
  }
}

put(
  'MANIFEST.json',
  JSON.stringify({ takenAt: new Date().toISOString(), titles: taken, calls, images: images.size }, null, 2),
);
console.log(
  `\n${taken.length} titles, ${calls} API responses, ${images.size} images (${Math.round(bytes / 1024)} KB) → design/real/`,
);
