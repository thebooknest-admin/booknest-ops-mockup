/**
 * Book Nest ISBN Classifier — Express router
 * Drop this into your Railway ops dashboard server alongside your tRPC setup.
 *
 * Usage: app.use("/api/isbn", isbnRouter);
 *
 * GET /api/isbn/classify?isbn=9780062362179
 *   → { book: BookMetadata, classification: Classification }
 *
 * Requires env var:
 *   ANTHROPIC_API_KEY  — for AI fallback when rules can't decide tier/bin
 *                        (replaces the original OpenAI key from the prototype)
 */

import { Router, Request, Response } from "express";

const router = Router();

// ─── Types ───────────────────────────────────────────────────────────────────

type AgeTier = "Hatchlings" | "Fledglings" | "Soarers" | "Sky Readers";
type ThemeBin = "Adventure" | "Humor" | "Life" | "Learn" | "Identity" | "Nature" | "Seasonal";
type ConfidenceLevel = "high" | "medium" | "low" | "needs-review";

interface RawBookMetadata {
  isbn: string;
  title: string | null;
  authors: string[];
  description: string;
  coverUrl: string | null;
  categories: string[];
  pageCount: number | null;
  publishedDate: string | null;
  source: "google" | "openlibrary";
}

interface BookMetadata {
  isbn: string;
  title: string;
  authors: string[];
  description: string;
  coverUrl: string | null;
  coverCandidates: string[];
  categories: string[];
  pageCount: number | null;
  publishedDate: string | null;
  sources: ("google" | "openlibrary")[];
}

interface RuleTrace {
  tierSource: string;
  binSource: string;
  tagSources: string[];
  usedAIFallback: boolean;
  tierUsedAI: boolean;
  binUsedAI: boolean;
  signalsAligned: number;
  notes: string[];
}

interface Classification {
  ageTier: AgeTier;
  ageTierRange: string;
  themeBin: ThemeBin;
  supportingTags: string[];
  confidence: ConfidenceLevel;
  reasoning: string;
  trace: RuleTrace;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const AGE_RANGES: Record<AgeTier, string> = {
  Hatchlings: "0–2",
  Fledglings: "3–5",
  Soarers: "6–8",
  "Sky Readers": "9–12",
};

const VALID_TIERS: AgeTier[] = ["Hatchlings", "Fledglings", "Soarers", "Sky Readers"];
const VALID_BINS: ThemeBin[] = ["Adventure", "Humor", "Life", "Learn", "Identity", "Nature", "Seasonal"];

const PAGE_COUNT_RULES: { max: number | null; tier: AgeTier }[] = [
  { max: 16, tier: "Hatchlings" },
  { max: 40, tier: "Fledglings" },
  { max: 120, tier: "Soarers" },
  { max: null, tier: "Sky Readers" },
];

const TIER_KEYWORD_OVERRIDES: Record<AgeTier, string[]> = {
  Hatchlings: ["board book", "baby", "toddler"],
  Fledglings: ["picture book", "read-aloud", "read aloud"],
  Soarers: ["early reader", "chapter book", "easy reader", "beginning reader"],
  "Sky Readers": ["middle grade", "middle-grade", "novel"],
};

const STRONG_CATEGORY_TO_TIER: { match: string; tier: AgeTier }[] = [
  { match: "board book", tier: "Hatchlings" },
  { match: "picture book", tier: "Fledglings" },
  { match: "stories in rhyme", tier: "Fledglings" },
  { match: "rhyming", tier: "Fledglings" },
  { match: "preschool", tier: "Fledglings" },
  { match: "kindergarten", tier: "Fledglings" },
  { match: "read-aloud", tier: "Fledglings" },
  { match: "early reader", tier: "Soarers" },
  { match: "beginning reader", tier: "Soarers" },
  { match: "first chapter", tier: "Soarers" },
  { match: "chapter book", tier: "Soarers" },
  { match: "middle grade", tier: "Sky Readers" },
  { match: "young adult", tier: "Sky Readers" },
];

const CATEGORY_TO_TIER: { match: string; tier: AgeTier }[] = [
  ...STRONG_CATEGORY_TO_TIER,
  { match: "juvenile fiction", tier: "Soarers" },
];

const BIN_KEYWORDS: Record<ThemeBin, string[]> = {
  Adventure: ["magic","dragon","quest","mystery","spy","fantasy","exploration","adventure","treasure","pirate","wizard","knight"],
  Humor: ["funny","silly","prank","goofy","comic","absurd","hilarious","humor","laugh","joke"],
  Life: ["family","friendship","school","emotions","growing up","sibling","kindness","feelings","empathy"],
  Learn: ["facts","science","history","nonfiction","educational","learn","stem","math","alphabet","biography"],
  Identity: ["culture","diversity","identity","heritage","representation","immigration","bilingual","self-acceptance"],
  Nature: ["animal","animals","environment","weather","outdoors","ecosystems","nature","wildlife","forest","ocean","caterpillar","butterfly","bug","insect","bird","plant","tree","flower","garden","metamorphosis","life cycle"],
  Seasonal: ["holiday","christmas","halloween","easter","thanksgiving","hanukkah","valentine","seasonal"],
};

const BIN_PRECEDENCE: Record<ThemeBin, number> = {
  Seasonal: 7, Humor: 6, Learn: 5, Adventure: 4, Identity: 3, Life: 2, Nature: 1,
};

const CATEGORY_TO_BIN: { match: string; bin: ThemeBin }[] = [
  { match: "humor", bin: "Humor" }, { match: "comic", bin: "Humor" }, { match: "funny", bin: "Humor" },
  { match: "family", bin: "Life" }, { match: "friendship", bin: "Life" }, { match: "social", bin: "Life" }, { match: "emotions", bin: "Life" },
  { match: "nonfiction", bin: "Learn" }, { match: "science", bin: "Learn" }, { match: "history", bin: "Learn" }, { match: "educational", bin: "Learn" },
  { match: "fantasy", bin: "Adventure" }, { match: "adventure", bin: "Adventure" }, { match: "mystery", bin: "Adventure" },
  { match: "animal", bin: "Nature" }, { match: "nature", bin: "Nature" }, { match: "wildlife", bin: "Nature" }, { match: "plants", bin: "Nature" },
  { match: "holiday", bin: "Seasonal" }, { match: "christmas", bin: "Seasonal" },
  { match: "multicultural", bin: "Identity" }, { match: "diversity", bin: "Identity" },
];

const BIN_TAGS: Record<ThemeBin, string[]> = {
  Adventure: ["Exploration","Quest","Survival","Journey","Treasure","Pirates","Space","Time Travel","Fantasy","Magic","Dragons","Mythology","Superheroes","Secret Worlds","Detective","Mystery","Spy","Wilderness","Ocean Voyage","Historical Adventure","Action","Brave Hero","Epic Battle","Portal Fantasy","Expedition","Legends"],
  Humor: ["Silly","Funny","Giggle-Worthy","Slapstick","Animal Antics","Mischief Makers","School Shenanigans","Goofy Characters","Wordplay","Puns","Bathroom Humor","Pranks","Awkward Moments","Graphic Novel","Comic Style","Lighthearted","Unexpected Twist","Ridiculous Situations","Talking Animals","Over-the-Top","Quirky","Wild Imagination","Friendship Fails"],
  Life: ["Family","Siblings","Friendship","Kindness","Responsibility","Growing Up","School Life","Community","Teamwork","Courage","Empathy","Bedtime","New Experiences","Moving","New Baby","Loss & Grief","Adoption","Divorce","Celebrations","Traditions","Self-Discovery","Manners","Problem Solving","Feelings","Mental Health","Social Skills","Patience","Honesty"],
  Learn: ["Alphabet","Numbers","Counting","Shapes","Colors","Sight Words","Early Reader","STEM","Science","Space Facts","Dinosaurs","Animals","Ocean Life","History","Geography","Biographies","Inventors","Coding","Engineering","Math","Experiments","Weather","Human Body","Nature Facts","Nonfiction","Vocabulary Builder","Phonics","Cultural Learning"],
  Identity: ["Diversity","Cultural Stories","Black Joy","Latinx Stories","Asian Stories","Indigenous Stories","Disability Representation","Neurodiversity","LGBTQ+","Strong Girls","Boy Empowerment","Body Positivity","Confidence","Self-Acceptance","Family Heritage","Immigration","Language & Bilingual","Faith-Based","Traditions","Leadership","First Generation","Gender Expression","Overcoming Obstacles","Role Models","Empowerment","Representation Matters","Social Justice"],
  Nature: ["Animals","Farm","Zoo","Pets","Wildlife","Forest","Ocean","Bugs & Insects","Dinosaurs","Gardening","Camping","Hiking","National Parks","Conservation","Environment","Earth Day","Weather","Seasons","Water Cycle","Life Cycles","Ecosystems","Birds","Arctic","Jungle","Desert","Volcanoes","Rocks & Minerals"],
  Seasonal: ["Spring","Summer","Fall","Winter","Back to School","Halloween","Thanksgiving","Christmas","Hanukkah","Easter","Valentine's Day","St. Patrick's Day","Fourth of July","New Year","Lunar New Year","Ramadan","Diwali","Birthdays","Snow Day","Beach Day","Harvest","Graduation","Mother's Day","Father's Day","Earth Day","First Day of School"],
};

const CLASSICS_TAGS = ["Timeless","Household Staple","Must Read","Fan Favorite","Bestseller","Award Winner","Caldecott","Newbery","Vintage","Generational Favorite","Childhood Classic","Fairy Tale","Folktale","Fable","Nursery Rhymes"];
const MAX_TAGS = 5;

// ─── In-memory cache ──────────────────────────────────────────────────────────

const cache = new Map<string, { book: BookMetadata; classification: Classification }>();
const MAX_CACHE = 500;

function getCached(isbn: string) { return cache.get(isbn) ?? null; }
function setCached(isbn: string, book: BookMetadata, classification: Classification) {
  if (classification.confidence !== "high") return;
  if (cache.size >= MAX_CACHE) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(isbn, { book, classification });
}

// ─── ISBN utilities ───────────────────────────────────────────────────────────

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
function toIsbn13(isbn: string) {
  const c = cleanIsbn(isbn);
  if (c.length === 13) return c;
  const prefix = "978" + c.slice(0, 9);
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += parseInt(prefix[i], 10) * (i % 2 === 0 ? 1 : 3);
  return prefix + (10 - (sum % 10)) % 10;
}

// ─── External API fetches ─────────────────────────────────────────────────────

const TIMEOUT_MS = 4000;

async function fetchFromGoogleBooks(isbn: string): Promise<RawBookMetadata | null> {
  try {
    const res = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}&maxResults=1`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) return null;
    const data = await res.json() as any;
    if (!data.items?.length) return null;
    const vol = data.items[0].volumeInfo;
    const allIds = (vol.industryIdentifiers || []).map((id: any) => id.identifier.replace(/-/g, ""));
    if (!allIds.includes(isbn)) return null;
    let coverUrl = vol.imageLinks?.thumbnail || vol.imageLinks?.smallThumbnail || null;
    if (coverUrl) coverUrl = coverUrl.replace("http://", "https://").replace("zoom=1", "zoom=2");
    const title = vol.subtitle ? `${vol.title ?? ""}: ${vol.subtitle}`.trim() : vol.title ?? null;
    return { isbn, title, authors: vol.authors || [], description: vol.description || "", coverUrl, categories: vol.categories || [], pageCount: vol.pageCount || null, publishedDate: vol.publishedDate || null, source: "google" };
  } catch { return null; }
}

async function fetchFromOpenLibrary(isbn: string): Promise<RawBookMetadata | null> {
  try {
    const fetchJson = async (url: string) => {
      const r = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
      return r.ok ? r.json() : null;
    };
    const edition = await fetchJson(`https://openlibrary.org/isbn/${isbn}.json`) as any;
    if (!edition) return null;
    const [authorData, work] = await Promise.all([
      edition.authors?.length ? fetchJson(`https://openlibrary.org${edition.authors[0].key}.json`) : null,
      edition.works?.length ? fetchJson(`https://openlibrary.org${edition.works[0].key}.json`) : null,
    ]);
    const authors: string[] = (authorData as any)?.name ? [(authorData as any).name] : [];
    let description = "";
    let subjects: string[] = edition.subjects || [];
    if (work) {
      const w = work as any;
      description = typeof w.description === "string" ? w.description : w.description?.value ?? "";
      if (w.subjects) subjects = [...subjects, ...w.subjects];
    }
    if (edition.physical_format) subjects.push(edition.physical_format);
    const coverUrl = edition.covers?.length ? `https://covers.openlibrary.org/b/id/${edition.covers[0]}-L.jpg` : null;
    const title = edition.subtitle ? `${edition.title ?? ""}: ${edition.subtitle}`.trim() : edition.title ?? null;
    return { isbn, title, authors, description, coverUrl, categories: [...new Set(subjects)].slice(0, 15) as string[], pageCount: edition.number_of_pages || null, publishedDate: edition.publish_date || null, source: "openlibrary" };
  } catch { return null; }
}

function mergeBookSources(isbn: string, sources: (RawBookMetadata | null)[]): BookMetadata | null {
  const valid = sources.filter((s): s is RawBookMetadata => s !== null);
  if (!valid.length) return null;
  const longest = (arr: string[]) => arr.reduce((b, v) => v.length > b.length ? v : b, "");
  const firstNonNull = <T>(arr: (T | null)[]): T | null => arr.find(v => v != null) ?? null;
  const titles = valid.map(s => s.title).filter((t): t is string => !!t);
  const catSet = new Set<string>();
  valid.forEach(s => s.categories.forEach(c => catSet.add(c)));
  return {
    isbn, title: longest(titles) || "Unknown Title",
    authors: valid.map(s => s.authors).reduce((b, a) => a.length > b.length ? a : b, []),
    description: longest(valid.map(s => s.description)),
    coverUrl: firstNonNull(valid.map(s => s.coverUrl)),
    coverCandidates: [`https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg?default=false`, ...(firstNonNull(valid.map(s => s.coverUrl)) ? [firstNonNull(valid.map(s => s.coverUrl))!] : [])],
    categories: Array.from(catSet),
    pageCount: firstNonNull(valid.map(s => s.pageCount)),
    publishedDate: firstNonNull(valid.map(s => s.publishedDate)),
    sources: valid.map(s => s.source),
  };
}

// ─── Keyword helpers ──────────────────────────────────────────────────────────

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

// ─── Age tier resolver ────────────────────────────────────────────────────────

function resolveAgeTier(book: BookMetadata): { tier: AgeTier; source: string } | null {
  if (isBoardBook(book)) return { tier: "Hatchlings", source: "board book format" };
  const text = getNarrativeText(book);
  for (const [tier, keywords] of Object.entries(TIER_KEYWORD_OVERRIDES) as [AgeTier, string[]][]) {
    const matched = findFirstKeyword(text, keywords);
    if (matched) {
      if (isBoardBook(book) && tier === "Sky Readers") return { tier: "Fledglings", source: `keyword "${matched}" → downgraded (board book)` };
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
    for (const rule of PAGE_COUNT_RULES) {
      if (rule.max === null || book.pageCount <= rule.max) return { tier: rule.tier, source: `page count: ${book.pageCount}` };
    }
  }
  for (const entry of CATEGORY_TO_TIER) {
    for (const cat of book.categories) {
      if (cat.toLowerCase().includes(entry.match)) return { tier: entry.tier, source: `category "${entry.match}"` };
    }
  }
  return null;
}

// ─── Bin resolver ─────────────────────────────────────────────────────────────

function resolveBin(book: BookMetadata): { bin: ThemeBin; source: string } | null {
  const text = getSearchText(book);
  const scores: Record<ThemeBin, number> = { Adventure: 0, Humor: 0, Life: 0, Learn: 0, Identity: 0, Nature: 0, Seasonal: 0 };
  const matched: Record<ThemeBin, string[]> = { Adventure: [], Humor: [], Life: [], Learn: [], Identity: [], Nature: [], Seasonal: [] };
  for (const bin of VALID_BINS) { const m = findAllKeywords(text, BIN_KEYWORDS[bin]); scores[bin] += m.length; matched[bin] = m; }
  for (const cat of book.categories) {
    const lower = cat.toLowerCase();
    for (const entry of CATEGORY_TO_BIN) { if (lower.includes(entry.match)) scores[entry.bin] += 2; }
  }
  const max = Math.max(...Object.values(scores));
  if (max === 0) return null;
  const top = VALID_BINS.filter(b => scores[b] === max).sort((a, b) => BIN_PRECEDENCE[b] - BIN_PRECEDENCE[a]);
  const bin = top[0];
  const kws = matched[bin].slice(0, 3).join(", ");
  return { bin, source: `${scores[bin]} keyword match${scores[bin] !== 1 ? "es" : ""}: ${kws || bin}` };
}

// ─── Tag resolver ─────────────────────────────────────────────────────────────

function resolveTags(book: BookMetadata, bin: ThemeBin): { tags: string[]; sources: string[] } {
  const text = getSearchText(book);
  const candidates = new Set<string>();
  for (const tag of BIN_TAGS[bin]) { if (containsKeyword(text, tag)) candidates.add(tag); }
  for (const tag of CLASSICS_TAGS) { if (containsKeyword(text, tag)) candidates.add(tag); }
  return { tags: Array.from(candidates).slice(0, MAX_TAGS), sources: ["rule-based tag matching"] };
}

// ─── Confidence ───────────────────────────────────────────────────────────────

function computeConfidence(trace: RuleTrace, book: BookMetadata): ConfidenceLevel {
  const signals = [book.description.length >= 20, book.pageCount != null, book.categories.length > 0].filter(Boolean).length;
  if (signals === 0) return "needs-review";
  if (trace.tierUsedAI && trace.binUsedAI) return signals < 2 ? "needs-review" : "low";
  if (!trace.tierUsedAI && !trace.binUsedAI) return trace.signalsAligned >= 2 ? "high" : "medium";
  return trace.signalsAligned >= 1 ? "medium" : "low";
}

function countAlignedSignals(book: BookMetadata, tierSource: string, binSource: string) {
  let n = 0;
  if (tierSource.includes("page count") || tierSource.includes("board book")) n++;
  if (tierSource.includes("keyword")) n++;
  if (tierSource.includes("category")) n++;
  const m = binSource.match(/(\d+) keyword/);
  if (m && parseInt(m[1]) >= 2) n++;
  if (binSource.includes("category")) n++;
  return n;
}

// ─── AI fallback (Anthropic Claude) ──────────────────────────────────────────

async function runAIFallback(book: BookMetadata, needs: { needsTier: boolean; needsBin: boolean }) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { ageTier: "Fledglings" as AgeTier, themeBin: "Life" as ThemeBin, reasoning: "API key not configured — using default" };

  const systemPrompt = `You are a classifier for a children's book subscription called The Book Nest. Respond ONLY with valid JSON, no preamble.

CHOOSE EXACTLY ONE age tier:
- Hatchlings (0-2): Board books, first words, baby/toddler
- Fledglings (3-5): Picture books, preschool read-alouds
- Soarers (6-8): Early readers, early chapter books
- Sky Readers (9-12): Middle grade, upper-elementary

CHOOSE EXACTLY ONE primary bin:
- Adventure: magic, quest, mystery, fantasy, exploration
- Humor: funny, silly, goofy, pranks, absurd
- Life: family, friendship, school, emotions, growing up
- Learn: nonfiction, STEM, science, history, educational
- Identity: diversity, culture, representation, heritage
- Nature: animals, environment, wildlife, ecosystems
- Seasonal: holidays, Christmas, Halloween, birthdays

Tie-breakers: funny animal story → Humor (not Nature), dinosaur facts → Learn, holidays → Seasonal.

Respond ONLY: {"ageTier": "...", "themeBin": "...", "reasoning": "one short sentence"}`;

  const userPrompt = [
    `Title: ${book.title}`,
    `Authors: ${book.authors.join(", ")}`,
    `Description: ${book.description || "(none)"}`,
    `Categories: ${book.categories.slice(0, 8).join(", ") || "(none)"}`,
    `Page count: ${book.pageCount ?? "unknown"}`,
  ].join("\n");

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: 200, system: systemPrompt, messages: [{ role: "user", content: userPrompt }] }),
    });
    const data = await res.json() as any;
    const text = data.content?.[0]?.text;
    if (!text) throw new Error("Empty response");
    const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
    return {
      ageTier: VALID_TIERS.includes(parsed.ageTier) ? parsed.ageTier as AgeTier : "Fledglings" as AgeTier,
      themeBin: VALID_BINS.includes(parsed.themeBin) ? parsed.themeBin as ThemeBin : "Life" as ThemeBin,
      reasoning: parsed.reasoning || "AI classification",
    };
  } catch (err) {
    console.error("[ISBN Classifier] AI fallback failed:", err);
    return { ageTier: "Fledglings" as AgeTier, themeBin: "Life" as ThemeBin, reasoning: "AI fallback error — using defaults" };
  }
}

// ─── Main classify function ───────────────────────────────────────────────────

async function classifyBook(book: BookMetadata): Promise<Classification> {
  const trace: RuleTrace = { tierSource: "", binSource: "", tagSources: [], usedAIFallback: false, tierUsedAI: false, binUsedAI: false, signalsAligned: 0, notes: [] };

  const tierResult = resolveAgeTier(book);
  let ageTier: AgeTier = "Fledglings";
  if (tierResult) { ageTier = tierResult.tier; trace.tierSource = tierResult.source; }
  else trace.notes.push("Rules could not determine age tier");

  const binResult = resolveBin(book);
  let themeBin: ThemeBin = "Life";
  if (binResult) { themeBin = binResult.bin; trace.binSource = binResult.source; }
  else trace.notes.push("Rules could not determine bin");

  if (!tierResult || !binResult) {
    trace.usedAIFallback = true;
    const ai = await runAIFallback(book, { needsTier: !tierResult, needsBin: !binResult });
    if (!tierResult) { ageTier = ai.ageTier; trace.tierSource = `AI: ${ai.reasoning}`; trace.tierUsedAI = true; }
    if (!binResult) { themeBin = ai.themeBin; trace.binSource = `AI: ${ai.reasoning}`; trace.binUsedAI = true; }
  }

  const tagResult = resolveTags(book, themeBin);
  trace.tagSources = tagResult.sources;
  trace.signalsAligned = countAlignedSignals(book, trace.tierSource, trace.binSource);
  const confidence = computeConfidence(trace, book);

  return {
    ageTier, ageTierRange: AGE_RANGES[ageTier], themeBin,
    supportingTags: tagResult.tags, confidence,
    reasoning: [trace.tierSource && `Tier: ${trace.tierSource}`, trace.binSource && `Bin: ${trace.binSource}`].filter(Boolean).join(". ") || "Classified from available metadata.",
    trace,
  };
}

// ─── Route handler ────────────────────────────────────────────────────────────

router.get("/classify", async (req: Request, res: Response) => {
  const isbnParam = req.query.isbn as string;
  if (!isbnParam) return res.status(400).json({ error: "ISBN parameter is required" });

  const cleaned = cleanIsbn(isbnParam);
  if (!isValidIsbn(cleaned)) return res.status(400).json({ error: "Invalid ISBN format" });

  const isbn13 = toIsbn13(cleaned);

  const cached = getCached(isbn13);
  if (cached) return res.json({ ...cached, fromCache: true });

  const [google, openlib] = await Promise.all([fetchFromGoogleBooks(isbn13), fetchFromOpenLibrary(isbn13)]);
  const merged = mergeBookSources(isbn13, [google, openlib]);
  if (!merged) return res.status(404).json({ error: "Book not found. Verify the ISBN and try again." });

  const classification = await classifyBook(merged);
  setCached(isbn13, merged, classification);

  res.json({ book: merged, classification });
});

export default router;