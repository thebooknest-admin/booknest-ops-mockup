/**
 * ISBN Router — Book lookup & classification
 *
 * 1. isbn.classify → look up a book by ISBN, return metadata + age tier/bin/tags
 *
 * Uses Google Books + Open Library for metadata, rule engine for classification,
 * and GPT-3.5-turbo as AI fallback when rules can't decide.
 *
 * Requires env var: OPENAI_API_KEY
 */

import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc";

type AgeTier =
  | "Hatchlings"
  | "Fledglings"
  | "Soarers"
  | "Sky Readers"
  | "13+";
type ThemeBin =
  | "Adventure"
  | "Laughs & Chaos"
  | "Heart & Home"
  | "Wonder & Imagination"
  | "Wild & Wonderful"
  | "Discovery Den"
  | "Legends & Long Ago"
  | "Seasons & Celebrations"
  | "Big Worlds"
  | "Tiny Tales";
type ConfidenceLevel = "high" | "medium" | "low" | "needs-review";

interface RawBook {
  isbn: string; title: string | null; authors: string[]; description: string;
  coverUrl: string | null; categories: string[]; pageCount: number | null;
  publishedDate: string | null; source: "google" | "openlibrary";
}
interface BookMetadata {
  isbn: string; title: string; authors: string[]; description: string;
  coverUrl: string | null; coverCandidates: string[]; categories: string[];
  pageCount: number | null; publishedDate: string | null; sources: ("google" | "openlibrary")[];
}
interface RuleTrace {
  tierSource: string; binSource: string; tagSources: string[];
  usedAIFallback: boolean; tierUsedAI: boolean; binUsedAI: boolean;
  signalsAligned: number; notes: string[];
}
interface Classification {
  ageTier: AgeTier; ageTierRange: string; themeBin: ThemeBin;
  supportingTags: string[]; confidence: ConfidenceLevel;
  reasoning: string; trace: RuleTrace;
  isTooOld: boolean;
  tooOldReason: string;
}

const AGE_RANGES: Record<AgeTier, string> = {
  Hatchlings: "0–2",
  Fledglings: "3–5",
  Soarers: "6–8",
  "Sky Readers": "9–12",
  "13+": "13+",
};

const AGE_CODES: Record<AgeTier, string> = {
  Hatchlings: "HAT",
  Fledglings: "FLD",
  Soarers: "SOA",
  "Sky Readers": "SKY",
  "13+": "13P",
};

const THEME_CODES: Record<ThemeBin, string> = {
  Adventure: "ADV",
  "Laughs & Chaos": "LCH",
  "Heart & Home": "HRT",
  "Wonder & Imagination": "WON",
  "Wild & Wonderful": "WLD",
  "Discovery Den": "DSC",
  "Legends & Long Ago": "LEG",
  "Seasons & Celebrations": "SEA",
  "Big Worlds": "BIG",
  "Tiny Tales": "TNY",
};

const VALID_TIERS: AgeTier[] = [
  "Hatchlings",
  "Fledglings",
  "Soarers",
  "Sky Readers",
  "13+",
];
const VALID_BINS: ThemeBin[] = [
  "Adventure",
  "Laughs & Chaos",
  "Heart & Home",
  "Wonder & Imagination",
  "Wild & Wonderful",
  "Discovery Den",
  "Legends & Long Ago",
  "Seasons & Celebrations",
  "Big Worlds",
  "Tiny Tales",
];
const PAGE_COUNT_RULES: { max: number | null; tier: AgeTier }[] = [
  { max: 16, tier: "Hatchlings" }, { max: 40, tier: "Fledglings" },
  { max: 120, tier: "Soarers" }, { max: null, tier: "Sky Readers" },
];
const TIER_KEYWORD_OVERRIDES: Record<AgeTier, string[]> = {
  Hatchlings: ["board book", "baby", "toddler"],
  Fledglings: ["picture book", "read-aloud", "read aloud"],
  Soarers: ["early reader", "chapter book", "easy reader", "beginning reader"],
  "Sky Readers": ["middle grade", "middle-grade", "novel"],
  "13+": ["young adult", "teen", "ya fiction", "ya novel", "mature"],
};
const STRONG_CATEGORY_TO_TIER: { match: string; tier: AgeTier }[] = [
  { match: "board book", tier: "Hatchlings" }, { match: "picture book", tier: "Fledglings" },
  { match: "stories in rhyme", tier: "Fledglings" }, { match: "rhyming", tier: "Fledglings" },
  { match: "preschool", tier: "Fledglings" }, { match: "kindergarten", tier: "Fledglings" },
  { match: "read-aloud", tier: "Fledglings" }, { match: "early reader", tier: "Soarers" },
  { match: "beginning reader", tier: "Soarers" }, { match: "first chapter", tier: "Soarers" },
  { match: "chapter book", tier: "Soarers" }, { match: "middle grade", tier: "Sky Readers" },
  { match: "young adult", tier: "13+" },
];
const CATEGORY_TO_TIER = [...STRONG_CATEGORY_TO_TIER, { match: "juvenile fiction", tier: "Soarers" as AgeTier }];
const BIN_KEYWORDS: Record<ThemeBin, string[]> = {
  Adventure: [
    "quest",
    "adventure",
    "treasure",
    "pirate",
    "exploration",
    "journey",
    "survival",
    "hero",
    "heroes",
    "mystery",
  ],

  "Laughs & Chaos": [
    "funny",
    "humor",
    "silly",
    "goofy",
    "giggles",
    "prank",
    "chaos",
    "rhyming",
    "absurd",
    "joke",
  ],

  "Heart & Home": [
    "family",
    "friendship",
    "school",
    "feelings",
    "kindness",
    "emotions",
    "growing up",
    "community",
    "bedtime",
    "empathy",
  ],

  "Wonder & Imagination": [
    "magic",
    "fantasy",
    "dragon",
    "dragons",
    "unicorn",
    "fairy",
    "wizards",
    "dreams",
    "mythical",
    "imagination",
  ],

  "Wild & Wonderful": [
    "animals",
    "animal",
    "nature",
    "wildlife",
    "ocean",
    "forest",
    "dinosaurs",
    "farm",
    "bugs",
    "weather",
  ],

  "Discovery Den": [
    "science",
    "stem",
    "history",
    "space",
    "math",
    "technology",
    "engineering",
    "facts",
    "nonfiction",
    "experiments",
  ],

  "Legends & Long Ago": [
    "folklore",
    "fable",
    "fairy tale",
    "mythology",
    "legends",
    "historical",
    "ancient",
    "retelling",
    "classic",
  ],

  "Seasons & Celebrations": [
    "christmas",
    "halloween",
    "easter",
    "birthday",
    "summer",
    "winter",
    "spring",
    "fall",
    "holiday",
    "celebration",
  ],

  "Big Worlds": [
    "diversity",
    "culture",
    "identity",
    "representation",
    "acceptance",
    "belonging",
    "inclusion",
    "different perspectives",
    "heritage",
  ],

  "Tiny Tales": [
    "bedtime",
    "calming",
    "quiet",
    "gentle",
    "cozy",
    "read aloud",
    "routine",
    "soft",
    "short stories",
  ],
};
const BIN_PRECEDENCE: Record<ThemeBin, number> = {
  "Seasons & Celebrations": 10,
  "Laughs & Chaos": 9,
  "Discovery Den": 8,
  Adventure: 7,
  "Wonder & Imagination": 6,
  "Heart & Home": 5,
  "Wild & Wonderful": 4,
  "Big Worlds": 3,
  "Legends & Long Ago": 2,
  "Tiny Tales": 1,
};
const CATEGORY_TO_BIN: { match: string; bin: ThemeBin }[] = [
  { match: "humor", bin: "Laughs & Chaos" },
  { match: "comic", bin: "Laughs & Chaos" },
  { match: "funny", bin: "Laughs & Chaos" },

  { match: "family", bin: "Heart & Home" },
  { match: "friendship", bin: "Heart & Home" },
  { match: "school", bin: "Heart & Home" },
  { match: "emotions", bin: "Heart & Home" },

  { match: "fantasy", bin: "Wonder & Imagination" },
  { match: "magic", bin: "Wonder & Imagination" },
  { match: "dragons", bin: "Wonder & Imagination" },

  { match: "animals", bin: "Wild & Wonderful" },
  { match: "nature", bin: "Wild & Wonderful" },
  { match: "wildlife", bin: "Wild & Wonderful" },

  { match: "science", bin: "Discovery Den" },
  { match: "nonfiction", bin: "Discovery Den" },
  { match: "history", bin: "Discovery Den" },
  { match: "stem", bin: "Discovery Den" },

  { match: "folklore", bin: "Legends & Long Ago" },
  { match: "mythology", bin: "Legends & Long Ago" },
  { match: "fairy tale", bin: "Legends & Long Ago" },

  { match: "holiday", bin: "Seasons & Celebrations" },
  { match: "christmas", bin: "Seasons & Celebrations" },
  { match: "halloween", bin: "Seasons & Celebrations" },

  { match: "diversity", bin: "Big Worlds" },
  { match: "representation", bin: "Big Worlds" },
  { match: "culture", bin: "Big Worlds" },

  { match: "bedtime", bin: "Tiny Tales" },
  { match: "calming", bin: "Tiny Tales" },
  { match: "quiet", bin: "Tiny Tales" },
];
const BIN_TAGS: Record<ThemeBin, string[]> = {
  Adventure: ["Quest", "Exploration", "Pirates", "Treasure", "Mystery", "Adventure", "Fantasy", "Magic", "Heroes", "Journey", "Wilderness", "Survival"],
  "Laughs & Chaos": ["Silly", "Goofy", "Pranks", "Wordplay", "Giggles", "Chaos", "Funny", "Rhyming", "Interactive", "High Energy", "Absurd"],
  "Heart & Home": ["Family", "Friendship", "School", "Feelings", "Kindness", "Confidence", "Empathy", "Bedtime", "Community", "Growing Up", "New Experiences", "Emotional Growth"],
  "Wonder & Imagination": ["Dragons", "Unicorns", "Magic", "Fantasy", "Fairies", "Dreams", "Pretend Play", "Mythical Creatures", "Imagination", "Wizards", "Castles"],
  "Wild & Wonderful": ["Animals", "Pets", "Ocean", "Forest", "Dinosaurs", "Nature", "Wildlife", "Bugs", "Farm", "Gardening", "Camping", "Weather"],
  "Discovery Den": ["STEM", "Science", "Space", "Vehicles", "History", "Math", "Technology", "Engineering", "Experiments", "Human Body", "Facts", "Nonfiction"],
  "Legends & Long Ago": ["Fairy Tales", "Folklore", "Fables", "Mythology", "Classics", "Historical Fiction", "Legends", "Ancient Worlds", "Moral Lessons", "Retellings"],
  "Seasons & Celebrations": ["Christmas", "Halloween", "Easter", "Birthdays", "Back to School", "Summer", "Winter", "Spring", "Fall", "Traditions", "Celebrations"],
  "Big Worlds": ["Inclusion", "Diversity", "Cultures", "Acceptance", "Belonging", "Identity", "Representation", "Different Perspectives", "Confidence", "Empathy"],
  "Tiny Tales": ["Bedtime", "Calming", "Gentle Humor", "Read Aloud", "Quiet Stories", "Cozy", "Routine", "Short Stories", "Early Learning", "Soft Illustrations"],
};
const CLASSICS_TAGS = ["Timeless","Household Staple","Must Read","Fan Favorite","Bestseller","Award Winner","Caldecott","Newbery","Vintage","Generational Favorite","Childhood Classic","Fairy Tale","Folktale","Fable","Nursery Rhymes"];
const MAX_TAGS = 7;

const cache = new Map<string, { book: BookMetadata; classification: Classification }>();
const MAX_CACHE = 500;
function getCached(isbn: string) { return cache.get(isbn) ?? null; }
function setCached(isbn: string, book: BookMetadata, classification: Classification) {
  if (classification.confidence !== "high") return;
  if (cache.size >= MAX_CACHE) { const k = cache.keys().next().value; if (k) cache.delete(k); }
  cache.set(isbn, { book, classification });
}

function cleanIsbn(input: string) { return input.replace(/[^0-9Xx]/g, "").replace(/x/g, "X"); }
function isValidIsbn10(isbn: string) {
  if (isbn.length !== 10) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) { const d = parseInt(isbn[i], 10); if (isNaN(d)) return false; sum += d * (10 - i); }
  const last = isbn[9]; sum += last === "X" ? 10 : parseInt(last, 10);
  return sum % 11 === 0;
}
function isValidIsbn13(isbn: string) {
  if (isbn.length !== 13) return false;
  let sum = 0;
  for (let i = 0; i < 13; i++) { const d = parseInt(isbn[i], 10); if (isNaN(d)) return false; sum += i % 2 === 0 ? d : d * 3; }
  return sum % 10 === 0;
}
function isValidIsbn(isbn: string) { const c = cleanIsbn(isbn); return isValidIsbn10(c) || isValidIsbn13(c); }
function toIsbn13(isbn: string): string {
  const c = cleanIsbn(isbn);
  if (c.length === 13) return c;
  const prefix = "978" + c.slice(0, 9);
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += parseInt(prefix[i], 10) * (i % 2 === 0 ? 1 : 3);
  return prefix + String((10 - (sum % 10)) % 10);
}

const TIMEOUT_MS = 10000;
async function fetchFromGoogleBooks(isbn: string): Promise<RawBook | null> {
  try {
    console.log('>>> fetchFromGoogleBooks start', isbn);
    const apiKey = process.env.GOOGLE_BOOKS_API_KEY;
    const url = `https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}&maxResults=1${apiKey ? `&key=${apiKey}` : ""}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    console.log('>>> Google status:', res.status);
    if (!res.ok) return null;
    const data = await res.json() as any;
    if (!data.items?.length) return null;
    const vol = data.items[0].volumeInfo;
    let coverUrl = vol.imageLinks?.thumbnail || vol.imageLinks?.smallThumbnail || null;
    if (coverUrl) coverUrl = coverUrl.replace("http://", "https://").replace("zoom=1", "zoom=2");
    const title = vol.subtitle ? `${vol.title ?? ""}: ${vol.subtitle}`.trim() : vol.title ?? null;
    return { isbn, title, authors: vol.authors || [], description: vol.description || "", coverUrl, categories: vol.categories || [], pageCount: vol.pageCount || null, publishedDate: vol.publishedDate || null, source: "google" };
  } catch (e) {
    console.log('>>> Google fetch ERROR:', e);
    return null;
  }
}

async function fetchFromOpenLibrary(isbn: string): Promise<RawBook | null> {
  try {
    console.log('>>> fetchFromOpenLibrary start', isbn);
    const fetchJson = async (url: string) => { const r = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) }); return r.ok ? r.json() : null; };
    const edition = await fetchJson(`https://openlibrary.org/isbn/${isbn}.json`) as any;
    console.log('>>> OpenLib edition:', edition ? 'found' : 'null');
    if (!edition) return null;
    const [authorData, work] = await Promise.all([
      edition.authors?.length ? fetchJson(`https://openlibrary.org${edition.authors[0].key}.json`) : null,
      edition.works?.length ? fetchJson(`https://openlibrary.org${edition.works[0].key}.json`) : null,
    ]);
    const authors: string[] = (authorData as any)?.name ? [(authorData as any).name] : [];
    let description = ""; let subjects: string[] = edition.subjects || [];
    if (work) { const w = work as any; description = typeof w.description === "string" ? w.description : w.description?.value ?? ""; if (w.subjects) subjects = [...subjects, ...w.subjects]; }
    if (edition.physical_format) subjects.push(edition.physical_format);
    const coverUrl = edition.covers?.length ? `https://covers.openlibrary.org/b/id/${edition.covers[0]}-L.jpg` : null;
    const title = edition.subtitle ? `${edition.title ?? ""}: ${edition.subtitle}`.trim() : edition.title ?? null;
    return { isbn, title, authors, description, coverUrl, categories: [...new Set(subjects)].slice(0, 15) as string[], pageCount: edition.number_of_pages || null, publishedDate: edition.publish_date || null, source: "openlibrary" };
  } catch (e) {
    console.log('>>> OpenLib fetch ERROR:', e);
    return null;
  }
}

function mergeBookSources(isbn: string, sources: (RawBook | null)[]): BookMetadata | null {
  const valid = sources.filter((s): s is RawBook => s !== null);
  if (!valid.length) return null;
  const longest = (arr: string[]) => arr.reduce((b, v) => v.length > b.length ? v : b, "");
  const firstNonNull = <T>(arr: (T | null)[]): T | null => arr.find(v => v != null) ?? null;
  const catSet = new Set<string>(); valid.forEach(s => s.categories.forEach(c => catSet.add(c)));
  const mergedCover = firstNonNull(valid.map(s => s.coverUrl));
  return {
    isbn, title: longest(valid.map(s => s.title).filter((t): t is string => !!t)) || "Unknown Title",
    authors: valid.map(s => s.authors).reduce((b, a) => a.length > b.length ? a : b, []),
    description: longest(valid.map(s => s.description)), coverUrl: mergedCover,
    coverCandidates: [
      `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg?default=false`,
      `https://covers.openlibrary.org/b/isbn/${isbn}-M.jpg?default=false`,
      `https://books.google.com/books/content?vid=ISBN${isbn}&printsec=frontcover&img=1&zoom=1`,
      ...(mergedCover ? [mergedCover] : []),
    ],
    categories: Array.from(catSet), pageCount: firstNonNull(valid.map(s => s.pageCount)),
    publishedDate: firstNonNull(valid.map(s => s.publishedDate)), sources: valid.map(s => s.source),
  };
}

function escapeRe(s: string) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
function containsKeyword(text: string, kw: string) {
  const k = kw.toLowerCase();
  if (k.includes(" ") || k.includes("-")) return text.includes(k);
  return new RegExp(`\\b${escapeRe(k)}\\b`, "i").test(text);
}
function findFirstKeyword(text: string, keywords: string[]) { return keywords.find(k => containsKeyword(text, k)) ?? null; }
function findAllKeywords(text: string, keywords: string[]) { return keywords.filter(k => containsKeyword(text, k)); }
function getSearchText(b: BookMetadata) { return [b.title, b.description, ...b.categories, ...b.authors].join(" ").toLowerCase(); }
function getNarrativeText(b: BookMetadata) { return [b.title, b.description].join(" ").toLowerCase(); }
function isBoardBook(b: BookMetadata) { const t = getSearchText(b); return t.includes("board book") || t.includes("board-book") || b.categories.some(c => c.toLowerCase().includes("board book")); }

function resolveAgeTier(book: BookMetadata): { tier: AgeTier; source: string } | null {
  if (isBoardBook(book)) return { tier: "Hatchlings", source: "board book format" };
  const text = getNarrativeText(book);
  for (const [tier, keywords] of Object.entries(TIER_KEYWORD_OVERRIDES) as [AgeTier, string[]][]) {
    const matched = findFirstKeyword(text, keywords);
    if (matched) {
      if (book.pageCount != null && book.pageCount < 20 && (tier === "Soarers" || tier === "Sky Readers")) continue;
      return { tier, source: `keyword "${matched}"` };
    }
  }
  for (const entry of STRONG_CATEGORY_TO_TIER) {
    for (const cat of book.categories) {
      if (cat.toLowerCase().includes(entry.match)) {
        if (book.pageCount != null && book.pageCount < 20 && (entry.tier === "Soarers" || entry.tier === "Sky Readers")) continue;
        return { tier: entry.tier, source: `category "${entry.match}"` };
      }
    }
  }
  if (book.pageCount != null) {
  const text = getSearchText(book);

  // Picture books often run 32-48 pages
  const pictureBookSignals = [
    "picture book",
    "caldecott",
    "read-aloud",
    "illustrated",
    "bedtime",
    "preschool",
  ];

  const looksLikePictureBook = pictureBookSignals.some(signal =>
    text.includes(signal)
  );

  if (looksLikePictureBook && book.pageCount <= 56) {
    return {
      tier: "Fledglings",
      source: `picture book signal + page count (${book.pageCount})`,
    };
  }

  for (const rule of PAGE_COUNT_RULES) {
    if (rule.max === null || book.pageCount <= rule.max) {
      return {
        tier: rule.tier,
        source: `page count: ${book.pageCount}`,
      };
    }
  }
}
  for (const entry of CATEGORY_TO_TIER) {
    for (const cat of book.categories) {
      if (cat.toLowerCase().includes(entry.match)) return { tier: entry.tier, source: `category "${entry.match}"` };
    }
  }
  return null;
}
function resolveBin(book: BookMetadata): { bin: ThemeBin; source: string } | null {
  const text = getSearchText(book);
  const scores: Record<ThemeBin, number> = {
  Adventure: 0,
  "Laughs & Chaos": 0,
  "Heart & Home": 0,
  "Wonder & Imagination": 0,
  "Wild & Wonderful": 0,
  "Discovery Den": 0,
  "Legends & Long Ago": 0,
  "Seasons & Celebrations": 0,
  "Big Worlds": 0,
  "Tiny Tales": 0,
};

const matched: Record<ThemeBin, string[]> = {
  Adventure: [],
  "Laughs & Chaos": [],
  "Heart & Home": [],
  "Wonder & Imagination": [],
  "Wild & Wonderful": [],
  "Discovery Den": [],
  "Legends & Long Ago": [],
  "Seasons & Celebrations": [],
  "Big Worlds": [],
  "Tiny Tales": [],
};
  for (const bin of VALID_BINS) { const m = findAllKeywords(text, BIN_KEYWORDS[bin]); scores[bin] += m.length; matched[bin] = m; }
  for (const cat of book.categories) { const lower = cat.toLowerCase(); for (const entry of CATEGORY_TO_BIN) { if (lower.includes(entry.match)) scores[entry.bin] += 2; } }
  const max = Math.max(...Object.values(scores));
  if (max === 0) return null;
  const bin = VALID_BINS.filter(b => scores[b] === max).sort((a, b) => BIN_PRECEDENCE[b] - BIN_PRECEDENCE[a])[0];
  return { bin, source: `${scores[bin]} keyword match${scores[bin] !== 1 ? "es" : ""}: ${matched[bin].slice(0, 3).join(", ") || bin}` };
}
function resolveTags(book: BookMetadata, bin: ThemeBin): string[] {
  const text = getSearchText(book); const candidates = new Set<string>();
  for (const tag of BIN_TAGS[bin]) { if (containsKeyword(text, tag)) candidates.add(tag); }
  for (const tag of CLASSICS_TAGS) { if (containsKeyword(text, tag)) candidates.add(tag); }
  return Array.from(candidates).slice(0, MAX_TAGS);
}
function countAlignedSignals(tierSource: string, binSource: string) {
  let n = 0;
  if (tierSource.includes("page count") || tierSource.includes("board book")) n++;
  if (tierSource.includes("keyword")) n++;
  if (tierSource.includes("category")) n++;
  const m = binSource.match(/(\d+) keyword/); if (m && parseInt(m[1]) >= 2) n++;
  if (binSource.includes("category")) n++;
  return n;
}
function computeConfidence(trace: RuleTrace, book: BookMetadata): ConfidenceLevel {
  const signals = [book.description.length >= 20, book.pageCount != null, book.categories.length > 0].filter(Boolean).length;
  if (signals === 0) return "needs-review";
  if (trace.tierUsedAI && trace.binUsedAI) return signals < 2 ? "needs-review" : "low";
  if (!trace.tierUsedAI && !trace.binUsedAI) return trace.signalsAligned >= 2 ? "high" : "medium";
  return trace.signalsAligned >= 1 ? "medium" : "low";
}
async function runAIFallback(book: BookMetadata, needs: { needsTier: boolean; needsBin: boolean }) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return { ageTier: "Fledglings" as AgeTier, themeBin: "Heart & Home" as ThemeBin, reasoning: "API key not configured" };

  const system = `You are a classifier for a children's book subscription called The Book Nest.

Respond ONLY with valid JSON.
No markdown.
No explanation outside JSON.

AVAILABLE AGE TIERS:
- Hatchlings (0-2): board books, baby books, toddler books, first words
- Fledglings (3-5): picture books, preschool stories, read-alouds
- Soarers (6-8): early readers, beginner chapter books
- Sky Readers (9-12): middle grade, upper elementary
- 13+: teen, YA, mature middle grade, older audiences

IMPORTANT SAFETY RULES:
- If a book appears intended for teens, young adults, or mature readers, classify it as "13+".
- Books with explicit romance, mature themes, dark violence, horror, heavy emotional content, or teen-targeted marketing should be "13+".
- Never force YA or mature content into Sky Readers.
- Sky Readers should remain safe for upper elementary/tween readers.

AGE TIER GUIDANCE:
- Do not use page count alone.
- Picture books can be 32-56 pages and still be Fledglings.
- Early chapter books and beginner readers are usually Soarers.
- Middle grade novels are usually Sky Readers.
- If a book is commonly read aloud to preschool/kindergarten children, prefer Fledglings.
- If a book is meant for independent early readers, prefer Soarers.
- If uncertain between Sky Readers and 13+, lean toward 13+ for safety.

AVAILABLE THEMES:
- Adventure
- Laughs & Chaos
- Heart & Home
- Wonder & Imagination
- Wild & Wonderful
- Discovery Den
- Legends & Long Ago
- Seasons & Celebrations
- Big Worlds
- Tiny Tales

THEME GUIDANCE:
- Adventure: quests, mysteries, exploration, brave journeys, action
- Laughs & Chaos: silly, goofy, funny, prank-filled, absurd, high-energy stories
- Heart & Home: family, friendship, school, feelings, growing up, everyday life
- Wonder & Imagination: magic, fantasy, dreams, dragons, unicorns, pretend play
- Wild & Wonderful: animals, pets, nature, dinosaurs, farms, bugs, outdoors
- Discovery Den: nonfiction, STEM, facts, history, science, vehicles, how things work
- Legends & Long Ago: classics, fairy tales, folklore, mythology, fables, historical stories
- Seasons & Celebrations: holidays, birthdays, traditions, seasonal books
- Big Worlds: diversity, culture, identity, inclusion, representation, belonging
- Tiny Tales: bedtime, calming, gentle, short, soothing, cozy read-alouds

TAG GUIDANCE:
Choose 3-7 high-confidence supporting tags whenever possible.

Include:
- emotional themes
- reader experience themes
- setting/location themes
- childhood/social themes
- genre and tone signals
- recurring kid-interest topics

Do NOT only use literal keywords from the description.
Infer likely themes from:
- title
- series
- author
- genre
- intended audience
- common reader experience

Avoid under-tagging.
Most books should receive at least 3 supporting tags.
Use fewer than 3 only if the metadata is extremely limited.

Prefer broad useful discovery tags over hyper-specific niche tags.

If a book is classified as 13+:
- set "restricted" to true
- still choose the closest matching theme
- still provide supporting tags


Return ONLY this JSON shape:
The values shown in the JSON shape are examples only. Choose the actual ageTier, themeBin, supportingTags, restricted, and reasoning based on the book being classified.

{
  "ageTier": "Fledglings",
  "themeBin": "Heart & Home",
  "supportingTags": ["School", "Funny", "Growing Up"],
  "restricted": false,
  "reasoning": "Briefly explain why the age tier and theme were chosen."
}`;
  const userPrompt = [`Title: ${book.title}`, `Authors: ${book.authors.join(", ")}`, `Description: ${book.description || "(none)"}`, `Categories: ${book.categories.slice(0, 8).join(", ") || "(none)"}`, `Page count: ${book.pageCount ?? "unknown"}`].join("\n");

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
      body: JSON.stringify({
        model: "gpt-3.5-turbo",
        messages: [{ role: "system", content: system }, { role: "user", content: userPrompt }],
        response_format: { type: "json_object" },
        temperature: 0.1,
        max_tokens: 200,
      }),
    });
    const data = await res.json() as any;
    const parsed = JSON.parse(data.choices?.[0]?.message?.content?.replace(/```json|```/g, "").trim() ?? "{}");
    return {
  ageTier: VALID_TIERS.includes(parsed.ageTier)
    ? parsed.ageTier as AgeTier
    : "Fledglings" as AgeTier,

  themeBin: VALID_BINS.includes(parsed.themeBin)
    ? parsed.themeBin as ThemeBin
    : "Heart & Home" as ThemeBin,

  supportingTags: Array.isArray(parsed.supportingTags)
    ? parsed.supportingTags.slice(0, MAX_TAGS)
    : [],

  reasoning: parsed.reasoning || "AI classification",
};
  } catch {
  return {
    ageTier: "Fledglings" as AgeTier,
    themeBin: "Heart & Home" as ThemeBin, reasoning: "AI fallback error" }; }
}

function detectTooOld(book: BookMetadata): { tooOld: boolean; reason: string } {
  const text = getSearchText(book);
  const tooOldSignals = [
    "young adult", "teen fiction", "high school", "grade 9", "grade 10",
    "grade 11", "grade 12", "ages 13", "ages 14", "ages 15", "ages 16",
    "14 and up", "15 and up", "16 and up", "ya fiction", "ya novel",
  ];
  const matched = tooOldSignals.find(s => text.includes(s));
  if (matched) return { tooOld: true, reason: `Detected "${matched}" in metadata` };
  if (book.pageCount && book.pageCount > 400) {
    return { tooOld: true, reason: `Page count (${book.pageCount}) suggests teen/adult content` };
  }
  return { tooOld: false, reason: "" };
}

function detectRestrictedContent(book: BookMetadata): {
  restricted: boolean;
  reason: string;
} {
  const restrictedKeywords = [
    "young adult",
    "ya fiction",
    "ya novel",
    "teen",
    "teen fiction",
    "mature",
    "explicit",
    "dark romance",
    "romantic relationship",
    "explicit romance",
    "adult romance",
    "spicy",
    "high school",
    "new adult",
    "college romance",
    "psychological thriller",
    "graphic violence",
    "grade 9",
    "grade 10",
    "grade 11",
    "grade 12",
    "ages 13",
    "ages 14",
    "ages 15",
    "ages 16",
    "14 and up",
    "15 and up",
    "16 and up",
  ];

  const text = `
    ${book.title}
    ${book.description}
    ${book.categories?.join(" ")}
    ${book.authors?.join(" ")}
  `.toLowerCase();

  const matched = restrictedKeywords.find((keyword) =>
    text.includes(keyword)
  );

  if (matched) {
    return {
      restricted: true,
      reason: `Detected "${matched}" in metadata`,
    };
  }

  return {
    restricted: false,
    reason: "",
  };
}

async function classifyBook(book: BookMetadata): Promise<Classification> {
  const trace: RuleTrace = { tierSource: "", binSource: "", tagSources: [], usedAIFallback: false, tierUsedAI: false, binUsedAI: false, signalsAligned: 0, notes: [] };
  const tierResult = resolveAgeTier(book);
  let ageTier: AgeTier = "Fledglings";
  if (tierResult) { ageTier = tierResult.tier; trace.tierSource = tierResult.source; }
  else trace.notes.push("Rules could not determine age tier");
  const binResult = resolveBin(book);
  let themeBin: ThemeBin = "Heart & Home";
  if (binResult) { themeBin = binResult.bin; trace.binSource = binResult.source; }
  else trace.notes.push("Rules could not determine bin");
  if (!tierResult || !binResult) {
    trace.usedAIFallback = true;
    const ai = await runAIFallback(book, { needsTier: !tierResult, needsBin: !binResult });
    if (!tierResult) { ageTier = ai.ageTier; trace.tierSource = `AI: ${ai.reasoning}`; trace.tierUsedAI = true; }
    if (!binResult) { themeBin = ai.themeBin; trace.binSource = `AI: ${ai.reasoning}`; trace.binUsedAI = true; }
  }
  trace.signalsAligned = countAlignedSignals(trace.tierSource, trace.binSource);
  const confidence = computeConfidence(trace, book);
  let tags = resolveTags(book, themeBin);

if (tags.length < 3) {
  trace.usedAIFallback = true;

  const ai = await runAIFallback(book, {
    needsTier: false,
    needsBin: false,
  });

  const aiTags = Array.isArray((ai as any).supportingTags)
    ? (ai as any).supportingTags
    : [];

  tags = Array.from(new Set([...tags, ...aiTags])).slice(0, MAX_TAGS);

  if (aiTags.length > 0) {
    trace.tagSources.push("AI tag enrichment");
  }
}
  trace.tagSources.push("rule-based tag matching");
const tooOldCheck = detectTooOld(book);
const restrictedCheck = detectRestrictedContent(book);

if (restrictedCheck.restricted) {
  ageTier = "13+";
  trace.notes.push(restrictedCheck.reason);
}

return {
  ageTier,
  ageTierRange: AGE_RANGES[ageTier],
  themeBin,
  supportingTags: tags,
  confidence,
  reasoning:
    [
      trace.tierSource && `Tier: ${trace.tierSource}`,
      trace.binSource && `Bin: ${trace.binSource}`,
    ]
      .filter(Boolean)
      .join(". ") || "Classified from available metadata.",
  trace,
  isTooOld: tooOldCheck.tooOld || restrictedCheck.restricted,
  tooOldReason: restrictedCheck.reason || tooOldCheck.reason,
};
}

export const isbnRouter = router({
  classify: publicProcedure
    .input(z.object({ isbn: z.string() }))
    .query(async ({ input }) => {
      console.log('ISBN classify called with:', input.isbn);
      const cleaned = cleanIsbn(input.isbn);
      console.log('Cleaned ISBN:', cleaned, 'Valid:', isValidIsbn(cleaned));
      if (!isValidIsbn(cleaned)) throw new Error("Invalid ISBN format. Please check the number.");
      const isbn13 = toIsbn13(cleaned);
      const cached = getCached(isbn13);
      if (cached) return { ...cached, fromCache: true };
      const [google, openlib] = await Promise.all([fetchFromGoogleBooks(isbn13), fetchFromOpenLibrary(isbn13)]);
console.log('ISBN13:', isbn13);
console.log('Google result:', JSON.stringify(google));
console.log('OpenLib result:', JSON.stringify(openlib));
      const book = mergeBookSources(isbn13, [google, openlib]);
      if (!book) throw new Error("Book not found. Verify the ISBN and try again.");
      const classification = await classifyBook(book);
      setCached(isbn13, book, classification);
      return { book, classification, fromCache: false };
    }),
});