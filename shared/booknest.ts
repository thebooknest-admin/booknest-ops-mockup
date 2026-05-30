export const AGE_GROUP_KEYS = [
  "hatchlings",
  "fledglings",
  "soarers",
  "sky_readers",
] as const;

export type AgeGroupKey = (typeof AGE_GROUP_KEYS)[number];

export const AGE_GROUP_LABELS: Record<AgeGroupKey, string> = {
  hatchlings: "Hatchlings",
  fledglings: "Fledglings",
  soarers: "Soarers",
  sky_readers: "Sky Readers",
};

export const AGE_GROUP_DISPLAY: Record<AgeGroupKey, string> = {
  hatchlings: "Hatchlings (0-2)",
  fledglings: "Fledglings (3-5)",
  soarers: "Soarers (6-8)",
  sky_readers: "Sky Readers (9-12)",
};

export const SKU_PREFIX_BY_AGE_GROUP: Record<AgeGroupKey, string> = {
  hatchlings: "HATCH",
  fledglings: "FLED",
  soarers: "SOAR",
  sky_readers: "SKY",
};

export const BIN_CODE_BY_THEME: Record<string, string> = {
  Adventure: "ADV",
  "Laughs & Chaos": "LCH",
  "Heart & Home": "HRT",
  "Wonder & Imagination": "WND",
  "Wild & Wonderful": "WLD",
  "Discovery Den": "DSC",
  "Legends & Long Ago": "LEG",
  "Seasons & Celebrations": "SEA",
};

export const BOOK_TAG_TAXONOMY: Record<string, string[]> = {
  Adventure: [
    "Quest",
    "Exploration",
    "Pirates",
    "Treasure",
    "Mystery",
    "Adventure",
    "Fantasy",
    "Magic",
    "Heroes",
    "Journey",
    "Wilderness",
    "Survival",
  ],
  "Laughs & Chaos": [
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
  ],
  "Heart & Home": [
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
    "Calming",
    "Read Aloud",
    "Quiet Stories",
    "Cozy",
    "Routine",
    "Short Stories",
    "Early Learning",
    "Soft Illustrations",
  ],
  "Wonder & Imagination": [
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
  ],
  "Wild & Wonderful": [
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
  ],
  "Discovery Den": [
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
  ],
  "Legends & Long Ago": [
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
  ],
  "Seasons & Celebrations": [
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
  ],
};

export const BOOK_TAG_TO_THEME: Record<string, string> = Object.fromEntries(
  Object.entries(BOOK_TAG_TAXONOMY).flatMap(([theme, tags]) =>
    tags.map(tag => [tag, theme])
  )
);

export const ALLOWED_BOOK_TAGS = Object.keys(BOOK_TAG_TO_THEME);

const BOOK_TAG_ALIASES: Record<string, string> = {
  "fairy tale": "Fairy Tales",
  "fairy tales": "Fairy Tales",
  folktale: "Folklore",
  folktales: "Folklore",
  fable: "Fables",
  humor: "Funny",
  humour: "Funny",
  comedy: "Funny",
  magical: "Magic",
  princesses: "Castles",
  princess: "Castles",
  mermaid: "Mythical Creatures",
  mermaids: "Mythical Creatures",
  "realistic fiction": "Growing Up",
  relationships: "Friendship",
  siblings: "Family",
  grandparent: "Family",
  grandparents: "Family",
  neighbor: "Community",
  neighbours: "Community",
  divorce: "Feelings",
  timeless: "Classics",
  classic: "Classics",
  "childhood classic": "Classics",
  "nursery rhymes": "Rhyming",
};

function normalizeBookTagKey(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

export function sanitizeBookTags(tags: string[] | null | undefined): string[] {
  const normalizedToTag = new Map(
    ALLOWED_BOOK_TAGS.map(tag => [normalizeBookTagKey(tag), tag])
  );
  const result: string[] = [];

  for (const rawTag of tags ?? []) {
    const key = normalizeBookTagKey(String(rawTag));
    const tag = normalizedToTag.get(key) ?? BOOK_TAG_ALIASES[key];

    if (tag && BOOK_TAG_TO_THEME[tag] && !result.includes(tag)) {
      result.push(tag);
    }
  }

  return result;
}

export function getThemeFromBookTags(
  tags: string[] | null | undefined,
  preferredTheme?: string | null
): string | null {
  const counts: Record<string, number> = {};

  for (const tag of sanitizeBookTags(tags)) {
    const theme = BOOK_TAG_TO_THEME[tag];
    if (theme) counts[theme] = (counts[theme] ?? 0) + 1;
  }

  const max = Math.max(0, ...Object.values(counts));
  if (max === 0)
    return preferredTheme && BIN_CODE_BY_THEME[preferredTheme]
      ? preferredTheme
      : null;

  if (preferredTheme && counts[preferredTheme] === max) {
    return preferredTheme;
  }

  return (
    Object.keys(BOOK_TAG_TAXONOMY).find(theme => counts[theme] === max) ?? null
  );
}

export const BOOK_COPY_STATUSES = {
  pendingQc: "pending_qc",
  pendingLabel: "pending_label",
  pendingStock: "pending_stock",
  inHouse: "in_house",
  reserved: "reserved",
  inTransit: "in_transit",
  returned: "returned",
  donatedLfl: "donated_lfl",
  lost: "lost",
  withdrawn: "withdrawn",
} as const;

export const TERMINAL_BOOK_COPY_STATUSES = new Set<string>([
  BOOK_COPY_STATUSES.donatedLfl,
  BOOK_COPY_STATUSES.lost,
  BOOK_COPY_STATUSES.withdrawn,
  "damaged",
  "retired",
]);

export const LABEL_STATUSES = {
  pending: "pending",
  printed: "printed",
  notRequired: "not_required",
} as const;

export type BookCopyStatus =
  (typeof BOOK_COPY_STATUSES)[keyof typeof BOOK_COPY_STATUSES];

export function normalizeAgeGroup(
  value: string | null | undefined
): AgeGroupKey | null {
  const normalized = (value ?? "")
    .toLowerCase()
    .replace(/\s*\(.*\)\s*/g, "")
    .replace(/[-\s]+/g, "_")
    .trim();

  if (normalized.includes("hatch")) return "hatchlings";
  if (normalized.includes("fledg")) return "fledglings";
  if (normalized.includes("soar")) return "soarers";
  if (
    normalized.includes("sky_reader") ||
    normalized.includes("skyread") ||
    normalized.includes("sky")
  ) {
    return "sky_readers";
  }

  return null;
}

export function getAgeGroupLabel(value: string | null | undefined): string {
  const key = normalizeAgeGroup(value);
  return key ? AGE_GROUP_LABELS[key] : (value ?? "");
}

export function getSkuPrefixForAgeGroup(
  value: string | null | undefined
): string {
  const key = normalizeAgeGroup(value);
  return key ? SKU_PREFIX_BY_AGE_GROUP[key] : "UNK";
}

export function getBinCodeForAgeGroupAndTheme(
  ageGroup: string | null | undefined,
  theme: string | null | undefined
): string | null {
  const key = normalizeAgeGroup(ageGroup);
  const themeCode = theme ? BIN_CODE_BY_THEME[theme] : null;

  if (!key || !themeCode) return null;

  return `${SKU_PREFIX_BY_AGE_GROUP[key]}-${themeCode}-01`;
}
