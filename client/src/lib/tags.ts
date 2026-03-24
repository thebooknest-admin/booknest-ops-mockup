// BookNest Ops — Full Tag Taxonomy & Subject-to-Tag Mapping Engine
// Maps Open Library subjects → BookNest tags → bin category

// ─── TAXONOMY ────────────────────────────────────────────────────────────────

export type BinCategory = "ADVENTURE" | "HUMOR" | "LIFE" | "LEARN" | "IDENTITY" | "NATURE" | "SEASONAL" | "CLASSICS";

export interface TagCategory {
  id: BinCategory;
  label: string;
  emoji: string;
  color: { bg: string; text: string; border: string };
  tags: string[];
}

export const TAG_TAXONOMY: TagCategory[] = [
  {
    id: "ADVENTURE",
    label: "Adventure",
    emoji: "🌟",
    color: { bg: "oklch(0.95 0.06 220)", text: "oklch(0.30 0.14 220)", border: "oklch(0.80 0.10 220)" },
    tags: [
      "Exploration", "Quest", "Survival", "Journey", "Treasure", "Pirates", "Space",
      "Time Travel", "Fantasy", "Magic", "Dragons", "Mythology", "Superheroes",
      "Secret Worlds", "Detective", "Mystery", "Spy", "Wilderness", "Ocean Voyage",
      "Historical Adventure", "Action", "Survival Skills", "Treasure Hunt", "Lost & Found",
      "Brave Hero", "Epic Battle", "Portal Fantasy", "Expedition", "Legends",
    ],
  },
  {
    id: "HUMOR",
    label: "Humor",
    emoji: "😂",
    color: { bg: "oklch(0.96 0.06 75)", text: "oklch(0.45 0.14 75)", border: "oklch(0.84 0.10 75)" },
    tags: [
      "Silly", "Funny", "Giggle-Worthy", "Slapstick", "Animal Antics", "Mischief Makers",
      "School Shenanigans", "Goofy Characters", "Wordplay", "Puns", "Bathroom Humor",
      "Pranks", "Awkward Moments", "Graphic Novel", "Comic Style", "Lighthearted",
      "Unexpected Twist", "Ridiculous Situations", "Talking Animals", "Over-the-Top",
      "Sarcasm (Upper MG)", "Sibling Chaos", "Silly Mystery", "Exaggeration", "Quirky",
      "Wild Imagination", "Friendship Fails",
    ],
  },
  {
    id: "LIFE",
    label: "Life",
    emoji: "🌿",
    color: { bg: "oklch(0.95 0.05 155)", text: "oklch(0.30 0.12 155)", border: "oklch(0.80 0.08 155)" },
    tags: [
      "Family", "Siblings", "Friendship", "Kindness", "Responsibility", "Growing Up",
      "School Life", "Community", "Teamwork", "Courage", "Empathy", "Bedtime",
      "New Experiences", "Moving", "New Baby", "Loss & Grief", "Adoption", "Divorce",
      "Celebrations", "Traditions", "Self-Discovery", "Manners", "Problem Solving",
      "Feelings", "Mental Health", "Social Skills", "Patience", "Honesty",
    ],
  },
  {
    id: "LEARN",
    label: "Learn",
    emoji: "🧠",
    color: { bg: "oklch(0.95 0.05 270)", text: "oklch(0.30 0.14 270)", border: "oklch(0.80 0.10 270)" },
    tags: [
      "Alphabet", "Numbers", "Counting", "Shapes", "Colors", "Sight Words", "Early Reader",
      "STEM", "Science", "Space Facts", "Dinosaurs", "Animals", "Ocean Life", "History",
      "Geography", "Biographies", "Inventors", "Coding", "Engineering", "Math",
      "Experiments", "Weather", "Human Body", "Nature Facts", "Nonfiction",
      "Vocabulary Builder", "Phonics", "Chapter Book (Educational)", "Cultural Learning",
    ],
  },
  {
    id: "IDENTITY",
    label: "Identity",
    emoji: "🌈",
    color: { bg: "oklch(0.95 0.06 330)", text: "oklch(0.35 0.14 330)", border: "oklch(0.82 0.10 330)" },
    tags: [
      "Diversity", "Cultural Stories", "Black Joy", "Latinx Stories", "Asian Stories",
      "Indigenous Stories", "Disability Representation", "Neurodiversity", "LGBTQ+",
      "Strong Girls", "Boy Empowerment", "Body Positivity", "Confidence", "Self-Acceptance",
      "Family Heritage", "Immigration", "Language & Bilingual", "Faith-Based", "Traditions",
      "Leadership", "First Generation", "Gender Expression", "Overcoming Obstacles",
      "Role Models", "Empowerment", "Representation Matters", "Social Justice (Age Appropriate)",
    ],
  },
  {
    id: "NATURE",
    label: "Nature",
    emoji: "🌳",
    color: { bg: "oklch(0.95 0.06 140)", text: "oklch(0.28 0.12 140)", border: "oklch(0.80 0.08 140)" },
    tags: [
      "Animals", "Farm", "Zoo", "Pets", "Wildlife", "Forest", "Ocean", "Bugs & Insects",
      "Dinosaurs", "Gardening", "Camping", "Hiking", "National Parks", "Conservation",
      "Environment", "Earth Day", "Weather", "Seasons", "Water Cycle", "Life Cycles",
      "Ecosystems", "Birds", "Arctic", "Jungle", "Desert", "Volcanoes", "Rocks & Minerals",
    ],
  },
  {
    id: "SEASONAL",
    label: "Seasonal",
    emoji: "🍁",
    color: { bg: "oklch(0.96 0.05 45)", text: "oklch(0.40 0.14 45)", border: "oklch(0.84 0.10 45)" },
    tags: [
      "Spring", "Summer", "Fall", "Winter", "Back to School", "Halloween", "Thanksgiving",
      "Christmas", "Hanukkah", "Easter", "Valentine's Day", "St. Patrick's Day",
      "Fourth of July", "New Year", "Lunar New Year", "Ramadan", "Diwali", "Birthdays",
      "Snow Day", "Beach Day", "Harvest", "Graduation", "Mother's Day", "Father's Day",
      "Earth Day", "First Day of School",
    ],
  },
  {
    id: "CLASSICS",
    label: "Classics",
    emoji: "📚",
    color: { bg: "oklch(0.95 0.04 60)", text: "oklch(0.38 0.10 60)", border: "oklch(0.82 0.08 60)" },
    tags: [
      "Fairy Tale", "Folktale", "Fable", "Mythology", "Brothers Grimm",
      "Hans Christian Andersen", "Aesop", "Nursery Rhymes", "Golden Age", "Vintage",
      "Award Winner", "Caldecott", "Newbery", "Timeless", "Literary Classic",
      "Traditional Story", "Moral Lesson", "Epic Tale", "Historical Fiction",
      "Adapted Classic", "Illustrated Classic", "Poetry", "Chapter Classic",
      "Public Domain", "Character Driven", "Animal Classic", "Fantasy Classic",
    ],
  },
];

// ─── SUBJECT → TAG KEYWORD MAP ───────────────────────────────────────────────
// Maps lowercased Open Library subject keywords → BookNest tag names

const SUBJECT_TO_TAG: Record<string, string[]> = {
  // ADVENTURE
  "adventure": ["Exploration", "Quest", "Journey"],
  "quest": ["Quest"],
  "survival": ["Survival", "Survival Skills"],
  "exploration": ["Exploration", "Expedition"],
  "treasure": ["Treasure", "Treasure Hunt"],
  "pirate": ["Pirates"],
  "space": ["Space"],
  "time travel": ["Time Travel"],
  "fantasy": ["Fantasy", "Portal Fantasy"],
  "magic": ["Magic"],
  "dragon": ["Dragons"],
  "mythology": ["Mythology"],
  "superhero": ["Superheroes"],
  "detective": ["Detective"],
  "mystery": ["Mystery", "Detective"],
  "spy": ["Spy"],
  "wilderness": ["Wilderness"],
  "ocean voyage": ["Ocean Voyage"],
  "historical": ["Historical Adventure"],
  "action": ["Action"],
  "hero": ["Brave Hero"],
  "battle": ["Epic Battle"],
  "legend": ["Legends"],
  "expedition": ["Expedition"],
  "dystopian": ["Survival", "Epic Battle"],
  "war": ["Epic Battle", "Historical Adventure"],
  "science fiction": ["Space", "Time Travel"],
  "horror": ["Mystery", "Brave Hero"],
  "thriller": ["Mystery", "Spy"],
  "apocalyptic": ["Survival", "Epic Battle"],

  // HUMOR
  "humor": ["Funny", "Silly"],
  "humorous": ["Funny", "Silly"],
  "funny": ["Funny", "Giggle-Worthy"],
  "comedy": ["Funny", "Lighthearted"],
  "silly": ["Silly"],
  "comic": ["Comic Style", "Graphic Novel"],
  "graphic novel": ["Graphic Novel", "Comic Style"],
  "wordplay": ["Wordplay", "Puns"],
  "pun": ["Puns", "Wordplay"],
  "slapstick": ["Slapstick"],
  "mischief": ["Mischief Makers", "Pranks"],
  "school": ["School Shenanigans", "School Life"],
  "pranks": ["Pranks"],
  "talking animals": ["Talking Animals", "Animal Antics"],
  "quirky": ["Quirky", "Goofy Characters"],
  "lighthearted": ["Lighthearted"],

  // LIFE
  "family": ["Family"],
  "sibling": ["Siblings", "Sibling Chaos"],
  "friendship": ["Friendship"],
  "kindness": ["Kindness", "Empathy"],
  "growing up": ["Growing Up", "Self-Discovery"],
  "community": ["Community"],
  "teamwork": ["Teamwork"],
  "courage": ["Courage", "Brave Hero"],
  "empathy": ["Empathy"],
  "bedtime": ["Bedtime"],
  "new experiences": ["New Experiences"],
  "moving": ["Moving"],
  "grief": ["Loss & Grief"],
  "loss": ["Loss & Grief"],
  "adoption": ["Adoption"],
  "divorce": ["Divorce"],
  "celebration": ["Celebrations"],
  "tradition": ["Traditions"],
  "self-discovery": ["Self-Discovery"],
  "manners": ["Manners"],
  "problem solving": ["Problem Solving"],
  "feelings": ["Feelings"],
  "mental health": ["Mental Health"],
  "social skills": ["Social Skills"],
  "patience": ["Patience"],
  "honesty": ["Honesty"],
  "responsibility": ["Responsibility"],
  "coming of age": ["Growing Up", "Self-Discovery"],
  "personal development": ["Growing Up", "Self-Discovery"],

  // LEARN
  "alphabet": ["Alphabet", "Phonics"],
  "numbers": ["Numbers", "Counting"],
  "counting": ["Counting"],
  "shapes": ["Shapes"],
  "colors": ["Colors"],
  "stem": ["STEM", "Science"],
  "science": ["Science"],
  "space facts": ["Space Facts"],
  "dinosaur": ["Dinosaurs"],
  "ocean": ["Ocean Life"],
  "history": ["History"],
  "geography": ["Geography"],
  "biography": ["Biographies"],
  "biographies": ["Biographies"],
  "inventor": ["Inventors"],
  "coding": ["Coding"],
  "engineering": ["Engineering"],
  "math": ["Math"],
  "experiment": ["Experiments"],
  "weather": ["Weather"],
  "human body": ["Human Body"],
  "nonfiction": ["Nonfiction"],
  "vocabulary": ["Vocabulary Builder"],
  "phonics": ["Phonics"],
  "educational": ["Chapter Book (Educational)"],
  "cultural": ["Cultural Learning"],
  "astronomy": ["Space Facts", "Science"],
  "physics": ["Science", "STEM"],
  "chemistry": ["Science", "Experiments"],
  "biology": ["Science", "Life Cycles"],
  "ecology": ["Ecosystems", "Conservation"],

  // IDENTITY
  "diversity": ["Diversity", "Representation Matters"],
  "culture": ["Cultural Stories"],
  "african american": ["Black Joy"],
  "black": ["Black Joy"],
  "latinx": ["Latinx Stories"],
  "hispanic": ["Latinx Stories"],
  "asian": ["Asian Stories"],
  "indigenous": ["Indigenous Stories"],
  "native american": ["Indigenous Stories"],
  "disability": ["Disability Representation"],
  "autism": ["Neurodiversity"],
  "neurodiversity": ["Neurodiversity"],
  "lgbtq": ["LGBTQ+"],
  "gender": ["Gender Expression"],
  "girl power": ["Strong Girls"],
  "empowerment": ["Empowerment"],
  "body positivity": ["Body Positivity"],
  "confidence": ["Confidence"],
  "self-acceptance": ["Self-Acceptance"],
  "immigration": ["Immigration", "First Generation"],
  "bilingual": ["Language & Bilingual"],
  "faith": ["Faith-Based"],
  "leadership": ["Leadership"],
  "role model": ["Role Models"],
  "social justice": ["Social Justice (Age Appropriate)"],
  "overcoming": ["Overcoming Obstacles"],
  "heritage": ["Family Heritage"],
  "representation": ["Representation Matters"],

  // NATURE
  "animal": ["Animals", "Wildlife"],
  "animals": ["Animals", "Wildlife"],
  "farm": ["Farm"],
  "zoo": ["Zoo"],
  "pet": ["Pets"],
  "wildlife": ["Wildlife"],
  "forest": ["Forest"],
  "bug": ["Bugs & Insects"],
  "insect": ["Bugs & Insects"],
  "garden": ["Gardening"],
  "camping": ["Camping"],
  "hiking": ["Hiking"],
  "national park": ["National Parks"],
  "conservation": ["Conservation", "Environment"],
  "environment": ["Environment"],
  "earth day": ["Earth Day"],
  "season": ["Seasons"],
  "water cycle": ["Water Cycle"],
  "life cycle": ["Life Cycles"],
  "ecosystem": ["Ecosystems"],
  "bird": ["Birds"],
  "arctic": ["Arctic"],
  "jungle": ["Jungle"],
  "desert": ["Desert"],
  "volcano": ["Volcanoes"],
  "rock": ["Rocks & Minerals"],
  "mineral": ["Rocks & Minerals"],
  "plant": ["Gardening", "Life Cycles"],
  "tree": ["Forest", "Nature Facts"],
  "fish": ["Ocean", "Ocean Life"],
  "marine": ["Ocean", "Ocean Life"],
  "cat": ["Pets", "Animals"],
  "dog": ["Pets", "Animals"],
  "horse": ["Animals", "Wildlife"],
  "bear": ["Wildlife", "Forest"],
  "wolf": ["Wildlife", "Forest"],
  "whale": ["Ocean", "Wildlife"],

  // SEASONAL
  "spring": ["Spring"],
  "summer": ["Summer", "Beach Day"],
  "fall": ["Fall", "Harvest"],
  "autumn": ["Fall", "Harvest"],
  "winter": ["Winter", "Snow Day"],
  "halloween": ["Halloween"],
  "thanksgiving": ["Thanksgiving"],
  "christmas": ["Christmas"],
  "hanukkah": ["Hanukkah"],
  "easter": ["Easter"],
  "valentine": ["Valentine's Day"],
  "st. patrick": ["St. Patrick's Day"],
  "fourth of july": ["Fourth of July"],
  "new year": ["New Year"],
  "lunar new year": ["Lunar New Year"],
  "ramadan": ["Ramadan"],
  "diwali": ["Diwali"],
  "birthday": ["Birthdays"],
  "beach": ["Beach Day"],
  "harvest": ["Harvest"],
  "graduation": ["Graduation"],
  "mother's day": ["Mother's Day"],
  "father's day": ["Father's Day"],
  "back to school": ["Back to School", "First Day of School"],
  "holiday": ["Celebrations"],

  // CLASSICS
  "fairy tale": ["Fairy Tale"],
  "folktale": ["Folktale"],
  "fable": ["Fable"],
  "brothers grimm": ["Brothers Grimm", "Fairy Tale"],
  "hans christian andersen": ["Hans Christian Andersen", "Fairy Tale"],
  "aesop": ["Aesop", "Fable"],
  "nursery rhyme": ["Nursery Rhymes"],
  "vintage": ["Vintage", "Golden Age"],
  "award": ["Award Winner"],
  "caldecott": ["Caldecott", "Award Winner"],
  "newbery": ["Newbery", "Award Winner"],
  "classic": ["Literary Classic", "Timeless"],
  "traditional": ["Traditional Story"],
  "moral": ["Moral Lesson"],
  "epic": ["Epic Tale"],
  "historical fiction": ["Historical Fiction"],
  "adapted": ["Adapted Classic"],
  "illustrated": ["Illustrated Classic"],
  "poetry": ["Poetry"],
  "public domain": ["Public Domain"],
  "character": ["Character Driven"],
  "animal classic": ["Animal Classic"],
  "fantasy classic": ["Fantasy Classic"],
};

// ─── SCORING ENGINE ───────────────────────────────────────────────────────────

export interface TagSuggestion {
  tag: string;
  category: BinCategory;
  score: number;
}

export interface AutoTagResult {
  suggestedTags: string[];           // top 3-4 tags
  suggestedCategory: BinCategory;    // primary bin category
  categoryScores: Record<BinCategory, number>;
  allMatches: TagSuggestion[];
}

/** Build a flat reverse map: tag name → category */
const TAG_TO_CATEGORY: Record<string, BinCategory> = {};
for (const cat of TAG_TAXONOMY) {
  for (const tag of cat.tags) {
    TAG_TO_CATEGORY[tag] = cat.id;
  }
}

/** Score Open Library subjects against the BookNest tag taxonomy */
export function autoAssignTags(subjects: string[], title = "", author = ""): AutoTagResult {
  const tagScores: Record<string, number> = {};
  const categoryScores: Record<BinCategory, number> = {
    ADVENTURE: 0, HUMOR: 0, LIFE: 0, LEARN: 0,
    IDENTITY: 0, NATURE: 0, SEASONAL: 0, CLASSICS: 0,
  };

  // Combine all text to search
  const allText = [...subjects, title, author]
    .join(" ")
    .toLowerCase()
    .replace(/[^a-z0-9\s&'().]/g, " ");

  // Score each keyword match
  for (const [keyword, tags] of Object.entries(SUBJECT_TO_TAG)) {
    if (allText.includes(keyword.toLowerCase())) {
      for (const tag of tags) {
        tagScores[tag] = (tagScores[tag] || 0) + 1;
        const cat = TAG_TO_CATEGORY[tag];
        if (cat) categoryScores[cat] += 1;
      }
    }
  }

  // Sort tags by score descending
  const allMatches: TagSuggestion[] = Object.entries(tagScores)
    .map(([tag, score]) => ({ tag, category: TAG_TO_CATEGORY[tag], score }))
    .filter(m => m.category)
    .sort((a, b) => b.score - a.score);

  // Pick top 3-4 tags, ensuring at least 2 different categories if possible
  const selected: TagSuggestion[] = [];
  const usedCategories = new Set<BinCategory>();

  // First pass: pick highest-scoring tags, max 2 per category
  const catCount: Record<string, number> = {};
  for (const match of allMatches) {
    if (selected.length >= 4) break;
    const cc = catCount[match.category] || 0;
    if (cc < 2) {
      selected.push(match);
      catCount[match.category] = cc + 1;
      usedCategories.add(match.category);
    }
  }

  // If we have fewer than 3 tags, fill with next best regardless of category
  if (selected.length < 3) {
    for (const match of allMatches) {
      if (selected.length >= 3) break;
      if (!selected.find(s => s.tag === match.tag)) {
        selected.push(match);
      }
    }
  }

  // Determine primary bin category (highest score)
  const suggestedCategory = (Object.entries(categoryScores)
    .sort((a, b) => b[1] - a[1])[0]?.[0] || "LIFE") as BinCategory;

  return {
    suggestedTags: selected.map(s => s.tag),
    suggestedCategory,
    categoryScores,
    allMatches,
  };
}

/** Get the category object for a given category ID */
export function getCategoryById(id: BinCategory): TagCategory {
  return TAG_TAXONOMY.find(c => c.id === id) || TAG_TAXONOMY[2];
}

/** Get the category for a given tag name */
export function getCategoryForTag(tag: string): TagCategory | undefined {
  return TAG_TAXONOMY.find(c => c.tags.includes(tag));
}

/** Build bin name from age group + category */
export function buildBinName(ageGroup: string, category: BinCategory): string {
  const prefixMap: Record<string, string> = {
    "Hatchlings (0-2)": "HATC",
    "Fledglings (3-5)": "FLED",
    "Soarers (6-8)": "SOAR",
    "Sky Readers (9-12)": "SKY",
  };
  const prefix = prefixMap[ageGroup] || "FLED";
  const catName = category.replace("_", "");
  return `${prefix}-${catName}-01`;
}
