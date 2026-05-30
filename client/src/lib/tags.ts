// BookNest Ops — Full Tag Taxonomy & Subject-to-Tag Mapping Engine
// Maps Open Library subjects → BookNest tags → bin category

// ─── TAXONOMY ────────────────────────────────────────────────────────────────

export type BinCategory =
  | "ADVENTURE"
  | "LAUGHS_CHAOS"
  | "HEART_HOME"
  | "WONDER_IMAGINATION"
  | "WILD_WONDERFUL"
  | "DISCOVERY_DEN"
  | "LEGENDS_LONG_AGO"
  | "SEASONS_CELEBRATIONS";

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
    emoji: "🗺️",
    color: {
      bg: "oklch(0.95 0.06 220)",
      text: "oklch(0.30 0.14 220)",
      border: "oklch(0.80 0.10 220)",
    },
    tags: [
      "Quest",
      "Exploration",
      "Pirates",
      "Treasure",
      "Mystery",
      "Adventure",
      "Action",
      "Heroes",
      "Journey",
      "Sports",
      "Wilderness",
      "Survival",
    ],
  },

  {
    id: "LAUGHS_CHAOS",
    label: "Laughs & Chaos",
    emoji: "😂",
    color: {
      bg: "oklch(0.96 0.06 75)",
      text: "oklch(0.45 0.14 75)",
      border: "oklch(0.84 0.10 75)",
    },
    tags: [
      "Silly",
      "Goofy",
      "Pranks",
      "Wordplay",
      "Giggles",
      "Chaos",
      "Funny",
      "Rhyming",
      "Interactive",
      "High Energy",
      "Absurd",
      "Gentle Humor",
      "Mischief",
      "Comics",
    ],
  },

  {
    id: "HEART_HOME",
    label: "Heart & Home",
    emoji: "💛",
    color: {
      bg: "oklch(0.95 0.05 155)",
      text: "oklch(0.30 0.12 155)",
      border: "oklch(0.80 0.08 155)",
    },
    tags: [
      "Family",
      "Friendship",
      "School",
      "Feelings",
      "Kindness",
      "Confidence",
      "Empathy",
      "Bedtime",
      "Community",
      "Growing Up",
      "New Experiences",
      "Emotional Growth",
      "Inclusion",
      "Diversity",
      "Cultures",
      "Acceptance",
      "Belonging",
      "Identity",
      "Representation",
      "Different Perspectives",
      "Courage",
      "Grief",
      "Manners",
      "Sharing",
      "Teamwork",
      "Calming",
      "Read Aloud",
      "Quiet Stories",
      "Cozy",
      "Routine",
      "Short Stories",
      "Early Learning",
      "Soft Illustrations",
    ],
  },

  {
    id: "WONDER_IMAGINATION",
    label: "Wonder & Imagination",
    emoji: "✨",
    color: {
      bg: "oklch(0.95 0.06 300)",
      text: "oklch(0.35 0.14 300)",
      border: "oklch(0.82 0.10 300)",
    },
    tags: [
      "Dragons",
      "Unicorns",
      "Magic",
      "Fantasy",
      "Fairies",
      "Dreams",
      "Pretend Play",
      "Mythical Creatures",
      "Imagination",
      "Wizards",
      "Castles",
      "Princesses",
      "Mermaids",
      "Superheroes",
    ],
  },

  {
    id: "WILD_WONDERFUL",
    label: "Wild & Wonderful",
    emoji: "🦊",
    color: {
      bg: "oklch(0.95 0.06 140)",
      text: "oklch(0.28 0.12 140)",
      border: "oklch(0.80 0.08 140)",
    },
    tags: [
      "Animals",
      "Pets",
      "Ocean",
      "Forest",
      "Dinosaurs",
      "Nature",
      "Wildlife",
      "Bugs",
      "Farm",
      "Gardening",
      "Camping",
      "Weather",
      "Horses",
    ],
  },

  {
    id: "DISCOVERY_DEN",
    label: "Discovery Den",
    emoji: "🧠",
    color: {
      bg: "oklch(0.95 0.05 270)",
      text: "oklch(0.30 0.14 270)",
      border: "oklch(0.80 0.10 270)",
    },
    tags: [
      "STEM",
      "Science",
      "Space",
      "Vehicles",
      "History",
      "Math",
      "Technology",
      "Engineering",
      "Experiments",
      "Human Body",
      "Facts",
      "Nonfiction",
      "Biography",
      "Careers",
      "Art",
      "Music",
    ],
  },

  {
    id: "LEGENDS_LONG_AGO",
    label: "Legends & Long Ago",
    emoji: "🏰",
    color: {
      bg: "oklch(0.95 0.04 60)",
      text: "oklch(0.38 0.10 60)",
      border: "oklch(0.82 0.08 60)",
    },
    tags: [
      "Fairy Tales",
      "Folklore",
      "Fables",
      "Mythology",
      "Classics",
      "Historical Fiction",
      "Legends",
      "Ancient Worlds",
      "Moral Lessons",
      "Retellings",
      "Vintage",
    ],
  },

  {
    id: "SEASONS_CELEBRATIONS",
    label: "Seasons & Celebrations",
    emoji: "🍂",
    color: {
      bg: "oklch(0.96 0.05 45)",
      text: "oklch(0.40 0.14 45)",
      border: "oklch(0.84 0.10 45)",
    },
    tags: [
      "Christmas",
      "Halloween",
      "Easter",
      "Birthdays",
      "Back to School",
      "Summer",
      "Winter",
      "Spring",
      "Fall",
      "Traditions",
      "Celebrations",
      "Valentine's Day",
      "Thanksgiving",
    ],
  },
];

// ─── SCORING ENGINE ───────────────────────────────────────────────────────────

export interface TagSuggestion {
  tag: string;
  category: BinCategory;
  score: number;
}

export interface AutoTagResult {
  suggestedTags: string[]; // up to 7 tags
  suggestedCategory: BinCategory; // primary bin category
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

const SUBJECT_TO_TAG: Record<string, string[]> = {
  adventure: ["Adventure", "Quest", "Exploration"],
  action: ["Action", "Adventure"],
  quest: ["Quest"],
  pirate: ["Pirates"],
  treasure: ["Treasure"],
  mystery: ["Mystery"],
  survival: ["Survival"],
  hero: ["Heroes"],
  heroes: ["Heroes"],
  sports: ["Sports"],
  sport: ["Sports"],

  funny: ["Funny", "Silly", "Giggles"],
  humor: ["Funny", "Silly"],
  comic: ["Comics", "Funny"],
  comics: ["Comics", "Funny"],
  graphic: ["Comics"],
  silly: ["Silly", "Goofy"],
  prank: ["Pranks", "Mischief"],
  mischief: ["Mischief"],
  rhyme: ["Rhyming"],
  rhyming: ["Rhyming"],

  family: ["Family"],
  friendship: ["Friendship"],
  school: ["School"],
  feelings: ["Feelings"],
  kindness: ["Kindness"],
  bedtime: ["Bedtime"],
  courage: ["Courage", "Confidence"],
  brave: ["Courage"],
  grief: ["Grief", "Feelings"],
  loss: ["Grief", "Feelings"],
  manners: ["Manners"],
  sharing: ["Sharing"],
  teamwork: ["Teamwork"],

  magic: ["Magic"],
  fantasy: ["Fantasy"],
  dragon: ["Dragons"],
  unicorn: ["Unicorns"],
  fairy: ["Fairies"],
  princess: ["Princesses"],
  mermaid: ["Mermaids"],
  superhero: ["Superheroes"],

  animal: ["Animals"],
  animals: ["Animals"],
  pet: ["Pets"],
  horse: ["Horses"],
  horses: ["Horses"],
  ocean: ["Ocean"],
  dinosaur: ["Dinosaurs"],
  dinosaurs: ["Dinosaurs"],
  nature: ["Nature"],
  wildlife: ["Wildlife"],
  farm: ["Farm"],

  science: ["Science", "STEM"],
  space: ["Space"],
  vehicle: ["Vehicles"],
  vehicles: ["Vehicles"],
  history: ["History"],
  math: ["Math"],
  nonfiction: ["Nonfiction", "Facts"],
  biography: ["Biography", "Nonfiction"],
  career: ["Careers"],
  careers: ["Careers"],
  art: ["Art"],
  music: ["Music"],

  folklore: ["Folklore"],
  fable: ["Fables"],
  mythology: ["Mythology"],
  classic: ["Classics"],
  historical: ["Historical Fiction"],
  vintage: ["Vintage"],

  christmas: ["Christmas"],
  halloween: ["Halloween"],
  easter: ["Easter"],
  birthday: ["Birthdays"],
  birthdays: ["Birthdays"],
  valentine: ["Valentine's Day"],
  thanksgiving: ["Thanksgiving"],

  diversity: ["Diversity"],
  culture: ["Cultures"],
  cultures: ["Cultures"],
  inclusion: ["Inclusion"],
  identity: ["Identity"],
  acceptance: ["Acceptance"],

  calming: ["Calming"],
  gentle: ["Gentle Humor"],
  quiet: ["Quiet Stories"],
  routine: ["Routine"],
  "read aloud": ["Read Aloud"],
};

/** Score Open Library subjects against the BookNest tag taxonomy */
export function autoAssignTags(
  subjects: string[],
  title = "",
  author = ""
): AutoTagResult {
  const tagScores: Record<string, number> = {};
  const categoryScores: Record<BinCategory, number> = {
    ADVENTURE: 0,
    LAUGHS_CHAOS: 0,
    HEART_HOME: 0,
    WONDER_IMAGINATION: 0,
    WILD_WONDERFUL: 0,
    DISCOVERY_DEN: 0,
    LEGENDS_LONG_AGO: 0,
    SEASONS_CELEBRATIONS: 0,
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

  // Pick up to 7 tags, ensuring at least 2 different categories if possible
  const selected: TagSuggestion[] = [];
  const usedCategories = new Set<BinCategory>();

  // First pass: pick highest-scoring tags, max 2 per category
  const catCount: Record<string, number> = {};
  for (const match of allMatches) {
    if (selected.length >= 7) break;
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
  const suggestedCategory = (Object.entries(categoryScores).sort(
    (a, b) => b[1] - a[1]
  )[0]?.[0] || "HEART_HOME") as BinCategory;

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
    "Hatchlings (0-2)": "HATCH",
    "Fledglings (3-5)": "FLED",
    "Soarers (6-8)": "SOAR",
    "Sky Readers (9-12)": "SKY",
  };

  const categoryMap: Record<BinCategory, string> = {
    ADVENTURE: "ADV",
    LAUGHS_CHAOS: "LCH",
    HEART_HOME: "HRT",
    WONDER_IMAGINATION: "WND",
    WILD_WONDERFUL: "WLD",
    DISCOVERY_DEN: "DSC",
    LEGENDS_LONG_AGO: "LEG",
    SEASONS_CELEBRATIONS: "SEA",
  };

  const prefix = prefixMap[ageGroup] || "FLD";
  const categoryCode = categoryMap[category] || "HRT";

  return `${prefix}-${categoryCode}-01`;
}
