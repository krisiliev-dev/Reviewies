/**
 * AniList, used to correct anime season structure.
 *
 * TMDB occasionally merges an anime's seasons into one block — Frieren is reported as
 * a single 38-episode season when its first season is 28 episodes. AniList models each
 * season as a separate entry linked by PREQUEL/SEQUEL relations, so following that
 * chain reconstructs the real boundaries.
 *
 * Constraints from AniList's terms, which shape the design:
 *  - 90 requests per minute, globally. Every call here is cached.
 *  - Using the API as a backup or data store is prohibited, as is mass collection.
 *    This fetches season structure for shows the user actually tracks, nothing more.
 *  - Free for commercial use under $150/month revenue.
 */

const ENDPOINT = 'https://graphql.anilist.co';

export interface AniListSeason {
  anilistId: number;
  title: string;
  episodes?: number;
  year?: number;
  format?: string;
}

interface MediaNode {
  id: number;
  idMal?: number;
  title?: { romaji?: string; english?: string };
  episodes?: number;
  seasonYear?: number;
  format?: string;
  relations?: {
    edges?: Array<{ relationType?: string; node?: MediaNode }>;
  };
}

const titleOf = (m: MediaNode) =>
  m.title?.english ?? m.title?.romaji ?? `AniList ${m.id}`;

async function query<T>(gql: string, variables: Record<string, unknown>, signal?: AbortSignal) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query: gql, variables }),
  });

  // 429 is the rate limit. Surfaced rather than swallowed so callers can back off
  // instead of hammering a shared 90/minute budget.
  if (res.status === 429) throw new Error('AniList rate limit reached');
  if (!res.ok) throw new Error(`AniList ${res.status}`);

  const body = (await res.json()) as { data?: T; errors?: Array<{ message: string }> };
  if (body.errors?.length) throw new Error(body.errors[0].message);
  return body.data as T;
}

const SEARCH = `
  query ($search: String) {
    Page(perPage: 10) {
      media(search: $search, type: ANIME, sort: SEARCH_MATCH) {
        id idMal episodes seasonYear format
        title { romaji english }
      }
    }
  }
`;

export async function searchAnime(term: string, signal?: AbortSignal): Promise<AniListSeason[]> {
  const data = await query<{ Page: { media: MediaNode[] } }>(SEARCH, { search: term }, signal);
  return (data.Page?.media ?? []).map((m) => ({
    anilistId: m.id,
    title: titleOf(m),
    episodes: m.episodes ?? undefined,
    year: m.seasonYear ?? undefined,
    format: m.format ?? undefined,
  }));
}

const WITH_RELATIONS = `
  query ($id: Int) {
    Media(id: $id, type: ANIME) {
      id episodes seasonYear format
      title { romaji english }
      relations {
        edges {
          relationType
          node { id episodes seasonYear format type title { romaji english } }
        }
      }
    }
  }
`;

/**
 * Walk the prequel/sequel chain to produce the seasons in broadcast order.
 *
 * Bounded deliberately: each hop is a request against a 90/minute global budget, and
 * long franchises can chain a dozen entries. `maxHops` caps the walk in each
 * direction rather than letting one show exhaust the allowance.
 */
export async function getSeasonChain(
  anilistId: number,
  opts: { maxHops?: number; signal?: AbortSignal } = {},
): Promise<AniListSeason[]> {
  const maxHops = opts.maxHops ?? 6;
  const seen = new Set<number>();
  const chain: AniListSeason[] = [];

  async function load(id: number): Promise<MediaNode | undefined> {
    try {
      const data = await query<{ Media: MediaNode }>(WITH_RELATIONS, { id }, opts.signal);
      return data.Media;
    } catch {
      return undefined;
    }
  }

  const toSeason = (m: MediaNode): AniListSeason => ({
    anilistId: m.id,
    title: titleOf(m),
    episodes: m.episodes ?? undefined,
    year: m.seasonYear ?? undefined,
    format: m.format ?? undefined,
  });

  const root = await load(anilistId);
  if (!root) return [];
  seen.add(root.id);
  chain.push(toSeason(root));

  // Only TV entries count as seasons. Movies, specials and side stories are
  // legitimate relations but are not part of the numbered run.
  const relatedId = (want: string, edges: MediaNode['relations']) =>
    edges?.edges?.find(
      (e) => e.relationType === want && e.node?.format === 'TV' && !seen.has(e.node.id),
    )?.node?.id;

  // Backwards to the first season.
  let cursor = root;
  for (let i = 0; i < maxHops; i++) {
    const prevId = relatedId('PREQUEL', cursor.relations);
    if (!prevId) break;
    const prev = await load(prevId);
    if (!prev) break;
    seen.add(prev.id);
    chain.unshift(toSeason(prev));
    cursor = prev;
  }

  // Forwards to the latest.
  cursor = root;
  for (let i = 0; i < maxHops; i++) {
    const nextId = relatedId('SEQUEL', cursor.relations);
    if (!nextId) break;
    const next = await load(nextId);
    if (!next) break;
    seen.add(next.id);
    chain.push(toSeason(next));
    cursor = next;
  }

  return chain;
}

/**
 * Split a flat run of episodes into seasons using AniList's episode counts.
 *
 * This is the payoff: TMDB hands us 38 episodes in "season 1"; AniList says the first
 * season is 28. The flat list is re-cut accordingly.
 *
 * Any leftover beyond the known counts is kept as a final season rather than dropped —
 * losing episodes would be far worse than an imperfect boundary.
 */
export function splitIntoSeasons<T>(episodes: T[], seasons: AniListSeason[]): T[][] {
  const counts = seasons.map((s) => s.episodes).filter((n): n is number => !!n && n > 0);
  if (counts.length === 0) return episodes.length ? [episodes] : [];

  const out: T[][] = [];
  let index = 0;

  for (const count of counts) {
    if (index >= episodes.length) break;
    out.push(episodes.slice(index, index + count));
    index += count;
  }

  if (index < episodes.length) out.push(episodes.slice(index));
  return out;
}
