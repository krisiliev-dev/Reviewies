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
 * A small searchable set beyond the pad, so "search any emoji" is real without
 * shipping the full Unicode table. A proper emoji index is a later refinement.
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

const ALL = [...EMOJI_PAD, ...EXTRA];

export function searchEmoji(query: string, limit = 20): PadEmoji[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  // Emoji typed or pasted directly should just work, even if it is not in our list.
  if (/\p{Extended_Pictographic}/u.test(q)) {
    const direct = Array.from(q).filter((c) => /\p{Extended_Pictographic}/u.test(c));
    if (direct.length) return direct.map((emoji) => ({ emoji, label: 'Custom', keywords: [] }));
  }

  const scored = ALL.map((e) => {
    const label = e.label.toLowerCase();
    let score = 0;
    if (label === q) score = 3;
    else if (label.startsWith(q)) score = 2;
    else if (e.keywords.some((k) => k.startsWith(q))) score = 1.5;
    else if (label.includes(q) || e.keywords.some((k) => k.includes(q))) score = 1;
    return { e, score };
  }).filter((x) => x.score > 0);

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.e);
}
