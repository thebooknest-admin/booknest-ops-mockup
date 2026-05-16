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
  Soarers: "SOR",
  "Sky Readers": "SKY",
  "13+": "13P",
};

const THEME_CODES: Record<ThemeBin, string> = {
  Adventure: "ADV",
  "Laughs & Chaos": "HUM",
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
const TIER_KEYWORD_OVERRIDES: Record<AgeTier, string[]> = {
  Hatchlings: ["board book", "toddler"],
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
  "Heart & Home": 10,
  "Wonder & Imagination": 9,
  Adventure: 8,
  "Laughs & Chaos": 7,
  "Wild & Wonderful": 6,
  "Discovery Den": 5,
  "Legends & Long Ago": 4,
  "Big Worlds": 3,
  "Seasons & Celebrations": 2,
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
  "Heart & Home": ["Family", "Friendship", "School", "Feelings", "Kindness", "Confidence", "Empathy", "Bedtime", "Community", "Growing Up", "New Experiences", "Emotional Growth", "Realistic Fiction", "Relationships", "Siblings", "Neighbor", "Community", "Divorce", "Grandparent"],
  "Wonder & Imagination": ["Dragons", "Unicorns", "Magic", "Fantasy", "Fairies", "Dreams", "Pretend Play", "Mythical Creatures", "Imagination", "Wizards", "Castles", "Magical", "Kingdom", "Princess", "Mermaid", "Spell", "butterfly kingdom",
"magical creatures",
"enchanted",
"fairy world",
"forest magic",
"tiny creatures",
"whimsical",],
  "Wild & Wonderful": ["Animals", "Ocean", "Forest", "Dinosaurs", "Nature", "Wildlife", "Bugs", "Farm", "Gardening", "Camping", "Weather"],
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
function isBoardBook(b: BookMetadata) {
  const t = getSearchText(b);

  if (b.pageCount != null && b.pageCount > 80) return false;

  return (
    t.includes("board book") ||
    t.includes("board-book") ||
    b.categories.some(c => c.toLowerCase().includes("board book"))
  );
}

function resolveAgeTier(book: BookMetadata): { tier: AgeTier; source: string } | null {
  if (isBoardBook(book)) return { tier: "Hatchlings", source: "board book format" };
  const narrativeText = getNarrativeText(book);
  for (const [tier, keywords] of Object.entries(TIER_KEYWORD_OVERRIDES) as [AgeTier, string[]][]) {
    const matched = findFirstKeyword(narrativeText, keywords);
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
 const text = getSearchText(book);


// Strong Sky Readers signals
if (
  text.includes("middle grade") ||
  text.includes("middle-grade") ||
  text.includes("tween")
) {
  return {
    tier: "Sky Readers",
    source: "middle grade signal",
  };
}

// Strong Soarers signals
if (
  text.includes("chapter book") ||
  text.includes("early reader") ||
  text.includes("branches")
) {
  return {
    tier: "Soarers",
    source: "early chapter signal",
  };
}

// Strong Fledglings signals
if (
  text.includes("picture book") ||
  text.includes("read-aloud") ||
  text.includes("preschool")
) {
  return {
    tier: "Fledglings",
    source: "picture book signal",
  };
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

const isAnimalEmotionalStory =
  (text.includes("pet") ||
    text.includes("puppy") ||
    text.includes("kitten") ||
    text.includes("dog") ||
    text.includes("cat") ||
    text.includes("skunk") ||
    text.includes("animal")) &&
  (text.includes("friendship") ||
    text.includes("family") ||
    text.includes("feelings") ||
    text.includes("heartfelt") ||
    text.includes("empathy") ||
    text.includes("belonging") ||
    text.includes("caring") ||
    text.includes("rescue") ||
    text.includes("home"));

if (isAnimalEmotionalStory) {
  return {
    bin: "Heart & Home",
    source: "animal story with emotional/family relationship focus",
  };
}

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
  for (const cat of book.categories) {
  const lower = cat.toLowerCase();

  for (const entry of CATEGORY_TO_BIN) {
    if (lower.includes(entry.match)) {
      scores[entry.bin] += 1;

      if (!matched[entry.bin].includes(entry.match)) {
        matched[entry.bin].push(entry.match);
      }
    }
  }
}
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

Your job is to classify books based on:
1. The PRIMARY reading experience
2. The PRIMARY shelf identity
3. The MOST useful discovery/browsing behavior for families

Do NOT classify based only on literal keywords.
Think like:
- a children's librarian
- a bookseller
- a parent browsing shelves
- a child looking for “more books like this”

--------------------------------------------------
AVAILABLE AGE TIERS
--------------------------------------------------

- Hatchlings (0-2)
  Board books, sensory books, baby books, first words, bedtime books, simple toddler concepts.

- Fledglings (3-5)
  Picture books, preschool stories, kindergarten readiness, read-alouds, simple early readers.

- Soarers (6-8)
  Early readers, Branches-style books, beginner chapter books, transitional readers, graphic chapter books.

- Sky Readers (9-12)
  Middle grade novels, upper elementary fiction, denser fantasy/adventure, tween themes.

- 13+
  Teen, YA, mature middle grade, emotionally intense, dark, violent, romantic, or older-audience content.

--------------------------------------------------
IMPORTANT SAFETY RULES
--------------------------------------------------

If uncertain between Sky Readers and 13+, prefer 13+ for safety.

Classify as 13+ if the book contains:
- explicit romance
- mature teen themes
- graphic violence
- horror
- heavy trauma
- self-harm
- mature emotional intensity
- older teen marketing

Do NOT force mature books into Sky Readers.

Sky Readers should remain appropriate for upper elementary/tween readers.

--------------------------------------------------
AGE TIER GUIDANCE
--------------------------------------------------

Do NOT use page count alone.

IMPORTANT:
- Picture books can still be Fledglings even at 40-60 pages.
- Illustrated chapter books are usually Soarers.
- Beginner independent readers are usually Soarers.
- Longer middle grade novels are usually Sky Readers.
- Read-aloud books are often Fledglings.
- Emotional complexity matters.
- Reading stamina matters.
- Sentence density matters.
- Vocabulary complexity matters.

Examples:
- Fly Guy → Soarers
- Junie B. Jones → Soarers
- Magic Tree House → Soarers
- Babysitters Club → Sky Readers
- Karen books → Soarers
- Percy Jackson → Sky Readers

--------------------------------------------------
AVAILABLE THEMES
--------------------------------------------------

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

--------------------------------------------------
THEME PHILOSOPHY
--------------------------------------------------

Choose the ONE PRIMARY shelf identity.

Do NOT choose based only on setting or surface elements.

Choose the theme that best matches:
- what kids browse for
- what emotional experience dominates
- what shelf it belongs beside

Ask:
“What would this book sit next to in a bookstore?”

--------------------------------------------------
THEME GUIDANCE
--------------------------------------------------

Adventure
- mysteries
- quests
- survival
- action
- detective stories
- missions
- exploration
- sports adventures
- fast-paced plots

Examples:
Magic Tree House
Boxcar Children
A to Z Mysteries
Star Wars adventures

Laughs & Chaos
- comedy-first books
- absurd humor
- prank energy
- goofy school chaos
- ridiculous situations
- gross-out humor

Examples:
Junie B. Jones
Captain Underpants
Fly Guy
My Weird School
Black Lagoon

Heart & Home
- family
- friendship
- emotional growth
- school life
- feelings
- belonging
- relationships
- realistic fiction
- caring animal stories

Examples:
Babysitters Club
Because of Winn-Dixie
The Lost Puppy
Sarah, Plain and Tall

Wonder & Imagination
- fantasy
- magic
- dragons
- unicorns
- fairies
- magical worlds
- whimsical adventures
- imaginative creatures

Examples:
Rainbow Magic
Unicorn Diaries
Frozen fantasy books
Mermicorn Island

Wild & Wonderful
- animals
- wildlife
- nature
- dinosaurs
- oceans
- bugs
- pets
- farms
- animal nonfiction

IMPORTANT:
Animal books focused on emotions/family should usually be Heart & Home instead.

Discovery Den
- STEM
- science
- educational nonfiction
- vehicles
- engineering
- technology
- how-things-work
- educational exploration

IMPORTANT:
Nature/animal nonfiction should usually stay in Wild & Wonderful unless STEM/science is the primary identity.

Legends & Long Ago
- mythology
- folklore
- fairy tales
- historical fiction
- classics
- ancient worlds
- historical survival stories

Examples:
I Survived
Greek myths
classic fairy tales

Seasons & Celebrations
ONLY use if the holiday/season is the PRIMARY identity.

Do NOT use just because:
- snow appears
- Christmas is mentioned once
- a holiday is background flavor

Examples:
Christmas collections
Halloween books
Valentine specials
Pumpkin/Easter books

Big Worlds
- diversity
- identity
- inclusion
- culture
- representation
- belonging
- global perspectives

Use only when identity/cultural perspective is CENTRAL to the reading experience.

Tiny Tales
- bedtime
- soothing
- calming
- cozy
- gentle
- lullaby-like
- very short comforting read-alouds

--------------------------------------------------
SERIES CONSISTENCY RULES
--------------------------------------------------

Keep series grouped consistently whenever possible.

Examples:
- Junie B. Jones → Laughs & Chaos
- Magic Tree House → Adventure
- Rainbow Magic → Wonder & Imagination
- Boxcar Children → Adventure
- Babysitters Club → Heart & Home
- Fly Guy → Laughs & Chaos

Do NOT move individual books unless the theme shift is VERY strong.

--------------------------------------------------
TAG GUIDANCE
--------------------------------------------------

Choose 3-7 supporting tags.

Include:
- emotional themes
- genre
- tone
- setting
- reader interests
- recurring childhood topics
- discovery keywords

Prefer broad discoverable tags over niche tags.

Good examples:
- Friendship
- School
- Magic
- Mystery
- Family
- Dinosaurs
- Humor
- Adventure
- Ocean
- Survival
- Science
- Princesses
- Feelings
- Sports
- Nonfiction

--------------------------------------------------
RESTRICTED RULES
--------------------------------------------------

If classified as 13+:
- set "restricted" to true
- still assign the closest theme
- still provide tags

Otherwise:
- restricted should be false

--------------------------------------------------
RETURN FORMAT
--------------------------------------------------

Return ONLY valid JSON.

{
  "ageTier": "Soarers",
  "themeBin": "Adventure",
  "supportingTags": ["Mystery", "Adventure", "Friendship"],
  "restricted": false,
  "reasoning": "Brief explanation of why the age tier and primary shelf theme were selected."
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
    const normalizeTheme = (theme: string): ThemeBin => {
  const mapping: Record<string, ThemeBin> = {
    "Adventure": "Adventure",
    "Laughs & Chaos": "Laughs & Chaos",
    "Laughs and Chaos": "Laughs & Chaos",

    "Heart & Home": "Heart & Home",
    "Heart and Home": "Heart & Home",

    "Wonder & Imagination": "Wonder & Imagination",
    "Wonder and Imagination": "Wonder & Imagination",

    "Wild & Wonderful": "Wild & Wonderful",
    "Wild and Wonderful": "Wild & Wonderful",

    "Discovery Den": "Discovery Den",

    "Legends & Long Ago": "Legends & Long Ago",
    "Legends and Long Ago": "Legends & Long Ago",

    "Seasons & Celebrations": "Seasons & Celebrations",
    "Seasons and Celebrations": "Seasons & Celebrations",

    "Big Worlds": "Big Worlds",

    "Tiny Tales": "Tiny Tales",
  };

  return mapping[theme?.trim()] ?? "Heart & Home";
};

return {
  ageTier: VALID_TIERS.includes(parsed.ageTier)
    ? parsed.ageTier as AgeTier
    : "Fledglings" as AgeTier,

  themeBin: normalizeTheme(parsed.themeBin),

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