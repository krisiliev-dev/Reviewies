export interface PadEmoji {
  emoji: string;
  label: string;
  keywords: string[];
}

/**
 * The default pad.
 *
 * Chosen for the moments people actually react to in television — a reveal, a
 * cliffhanger, someone being an idiot — rather than a generic emoji keyboard. Thumbs
 * up and down are permanent fixtures, which also gives us a lightweight quality
 * signal we can aggregate into episode ratings for free.
 */
export const EMOJI_PAD: PadEmoji[] = [
  { emoji: '👍', label: 'Yes', keywords: ['thumbs up', 'good', 'like', 'yes'] },
  { emoji: '👎', label: 'No', keywords: ['thumbs down', 'bad', 'dislike', 'no'] },
  { emoji: '😮', label: 'Reveal', keywords: ['shock', 'surprise', 'reveal', 'wow'] },
  { emoji: '🧗', label: 'Cliffhanger', keywords: ['cliff', 'cliffhanger', 'hanging'] },
  { emoji: '😂', label: 'Funny', keywords: ['laugh', 'funny', 'lol', 'joke'] },
  { emoji: '😭', label: 'Crying', keywords: ['cry', 'sad', 'sob', 'tears'] },
  { emoji: '😱', label: 'Scared', keywords: ['scream', 'scared', 'fear', 'horror'] },
  { emoji: '💀', label: 'Dead', keywords: ['dead', 'skull', 'died', 'killed'] },
  { emoji: '❤️', label: 'Love', keywords: ['love', 'heart', 'adore'] },
  { emoji: '💔', label: 'Heartbreak', keywords: ['heartbreak', 'broken', 'sad'] },
  { emoji: '🔥', label: 'Fire', keywords: ['fire', 'great', 'hype', 'lit'] },
  { emoji: '🤯', label: 'Mind blown', keywords: ['mind blown', 'twist', 'shock'] },
  { emoji: '🤔', label: 'Suspicious', keywords: ['think', 'suspicious', 'hmm', 'doubt'] },
  { emoji: '🙄', label: 'Eye roll', keywords: ['eye roll', 'annoyed', 'really'] },
  { emoji: '👀', label: 'Watching', keywords: ['eyes', 'looking', 'notice', 'watching'] },
  { emoji: '🚩', label: 'Red flag', keywords: ['red flag', 'warning', 'bad sign'] },
  { emoji: '🤡', label: 'Clown', keywords: ['clown', 'fool', 'idiot'] },
  { emoji: '😬', label: 'Awkward', keywords: ['awkward', 'cringe', 'yikes'] },
  { emoji: '🍿', label: 'Popcorn', keywords: ['popcorn', 'drama', 'here for it'] },
  { emoji: '⏳', label: 'Slow', keywords: ['slow', 'boring', 'drag', 'filler'] },
];

/**
 * A handful beyond the pad that deserve better names than Unicode gives them.
 *
 * These used to be the whole of "search any emoji", which meant thirty-two. The full
 * index below is the real answer; these survive because the official label is often not
 * the word anyone would type — "face with rolling eyes" is not how people look for 🙄.
 */
const EXTRA: PadEmoji[] = [
  { emoji: '🎉', label: 'Celebrate', keywords: ['party', 'celebrate', 'yay'] },
  { emoji: '😴', label: 'Sleepy', keywords: ['sleep', 'bored', 'tired'] },
  { emoji: '🤬', label: 'Angry', keywords: ['angry', 'rage', 'mad', 'furious'] },
  { emoji: '🥺', label: 'Pleading', keywords: ['pleading', 'sad', 'aww'] },
  { emoji: '🫣', label: 'Peeking', keywords: ['peek', 'hiding', 'nervous'] },
  { emoji: '🧠', label: 'Clever', keywords: ['brain', 'clever', 'smart', 'genius'] },
  { emoji: '⚔️', label: 'Fight', keywords: ['fight', 'battle', 'sword', 'action'] },
  { emoji: '💍', label: 'Romance', keywords: ['ring', 'wedding', 'romance', 'propose'] },
  { emoji: '🩸', label: 'Gore', keywords: ['blood', 'gore', 'violent'] },
  { emoji: '🐶', label: 'Dog', keywords: ['dog', 'animal', 'pet'] },
  { emoji: '👻', label: 'Ghost', keywords: ['ghost', 'spooky', 'haunted'] },
  { emoji: '🕵️', label: 'Detective', keywords: ['detective', 'mystery', 'clue'] },
];

const CURATED = [...EMOJI_PAD, ...EXTRA];

/**
 * The full index, fetched and parsed separately from everything else.
 *
 * It is a hundred and twenty kilobytes, and most sessions never open the search bar. A
 * static import puts that in the main bundle, where it is paid for on first load by
 * everyone, including the majority who only ever tap the pad. So it is a dynamic import:
 * a separate chunk on the web, and on the phone — where the app is downloaded once and
 * lives on the device — the only cost is parsing it, which still should not happen
 * unasked part-way through an episode.
 *
 * Until it resolves, search works against the curated set. That is the important part of
 * the design rather than a compromise: typing "fire" a hundred milliseconds after opening
 * the search bar finds 🔥 either way, and the long tail arrives before anyone gets to
 * "saxophone".
 */
let indexed: PadEmoji[] | undefined;
let loading: Promise<void> | undefined;

/**
 * Start loading the full index.
 *
 * Called when Watching Mode opens, so the index is ready long before the search bar is.
 * Safe to call repeatedly — the work happens once.
 */
export function loadEmojiIndex(): Promise<void> {
  loading ??= import('./emojiIndex')
    .then(({ EMOJI_INDEX_RAW }) => {
      indexed = parseIndex(EMOJI_INDEX_RAW);
    })
    .catch(() => {
      // A chunk that fails to load costs the long tail, not the feature. Cleared so a
      // later attempt can succeed — a flaky network on a train should not be permanent.
      loading = undefined;
    });
  return loading;
}

/**
 * The same emoji with its variation selector removed.
 *
 * U+FE0F is the character that asks for a colourful glyph rather than a monochrome one,
 * and whether an emoji carries it is a detail of the source it came from — the index
 * spells thumbs-up as `👍️` and the pad spells it `👍`. Identical on screen, different
 * strings, and a reaction is stored *as its string*: without this both would appear in
 * the pad, and the crowd's count for one moment would be split between two entries that
 * nobody could tell apart.
 *
 * Only used for comparing. The curated spelling is the one that gets stored, because it
 * is the one already in the database.
 */
const bare = (emoji: string): string => emoji.replace(/\uFE0F/g, '');

function parseIndex(raw: string): PadEmoji[] {
  const curatedChars = new Set(CURATED.map((e) => bare(e.emoji)));
  const fromIndex: PadEmoji[] = [];

  for (const line of raw.split('\n')) {
    const [emoji, label, words] = line.split('|');
    // The curated entries win: their labels are the words people actually type.
    if (!emoji || curatedChars.has(bare(emoji))) continue;
    fromIndex.push({ emoji, label, keywords: words ? words.split(' ') : [] });
  }

  return [...CURATED, ...fromIndex];
}

/** Whatever is available now: the curated set, or everything once it has loaded. */
function allEmoji(): PadEmoji[] {
  // Kick it off for anyone who searched before the screen asked, so the second query
  // finds the long tail even if the first did not.
  if (!indexed) void loadEmojiIndex();
  return indexed ?? CURATED;
}

/**
 * Find emoji by name, keyword, or by pasting one in.
 *
 * The brief asked for *any* emoji, and for a while this searched thirty-two of them —
 * so "taco" found nothing, in the feature the product is built around. It now searches
 * every emoji Unicode defines, with the curated pad ranked above the rest so the ones
 * chosen for television still come first when both match.
 */
export function searchEmoji(query: string, limit = 20): PadEmoji[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  // Emoji typed or pasted directly should just work, even if it is not in our list.
  if (/\p{Extended_Pictographic}/u.test(q)) {
    const direct = Array.from(q).filter((c) => /\p{Extended_Pictographic}/u.test(c));
    if (direct.length) return direct.map((emoji) => ({ emoji, label: 'Custom', keywords: [] }));
  }

  const curatedCount = CURATED.length;
  const scored: Array<{ e: PadEmoji; score: number }> = [];

  allEmoji().forEach((e, position) => {
    const label = e.label.toLowerCase();
    let score = 0;
    if (label === q) score = 4;
    else if (label.startsWith(q)) score = 3;
    else if (e.keywords.some((k) => k === q)) score = 2.5;
    else if (e.keywords.some((k) => k.startsWith(q))) score = 2;
    else if (label.includes(q) || e.keywords.some((k) => k.includes(q))) score = 1;
    if (score === 0) return;

    // A curated entry outranks an index entry that scored the same. Someone typing
    // "eyes" during an episode means 👀, not 🫥.
    scored.push({ e, score: position < curatedCount ? score + 0.5 : score });
  });

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.e);
}
