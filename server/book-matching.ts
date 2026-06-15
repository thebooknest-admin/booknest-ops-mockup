type NoteProfile = {
  excludeKeywords: string[];
  positiveKeywords: string[];
  themeBoosts: Record<string, number>;
  tagBoosts: Record<string, number>;
};

export const INTEREST_TO_THEMES: Record<string, string[]> = {
  "Brave & Bold": ["Adventure"],
  "Heart & Home": ["Heart & Home"],
  "Curious Minds": ["Discovery Den"],
  "Wild Things": ["Wild & Wonderful"],
  "All About Me": ["Heart & Home"],
  "Old Favorites": ["Legends & Long Ago"],
  "Celebrate!": ["Seasons & Celebrations"],
  "Giggle Worthy": ["Laughs & Chaos"],
  Adventure: ["Adventure"],
  "Wild & Wonderful": ["Wild & Wonderful"],
  "Legends & Long Ago": ["Legends & Long Ago"],
  "Wonder & Imagination": ["Wonder & Imagination"],
  Nature: ["Wild & Wonderful"],
  Art: ["Discovery Den"],
  Science: ["Discovery Den"],
  Space: ["Discovery Den"],
  Animals: ["Wild & Wonderful"],
  Dogs: ["Wild & Wonderful", "Heart & Home"],
  Cats: ["Wild & Wonderful", "Heart & Home"],
  Magic: ["Wonder & Imagination"],
  Dragons: ["Wonder & Imagination"],
  Mystery: ["Adventure"],
};

export const AVOID_TO_THEMES: Record<string, string[]> = {
  "Scary / Horror": ["horror", "scary"],
  "Scary Stories": ["horror", "scary"],
  Violence: ["violence", "war", "conflict"],
  "Death & Grief": ["death", "grief"],
  Divorce: ["divorce"],
  "Bathroom Humor": ["bathroom-humor"],
  War: ["war", "conflict"],
  Bullying: ["bullying"],
  "Religious Content": ["religious"],
  "LGBTQ+ themes": ["lgbtq"],
  Romance: ["romance"],
  "Scary Animals": ["scary-animals"],
  Clowns: ["clowns"],
  "Spiders / Bugs": ["bugs", "spiders"],
  "Ghosts / Supernatural": ["supernatural", "ghosts"],
  "Peer Pressure": ["peer-pressure"],
  Illness: ["illness"],
  "Political Topics": ["political"],
};

const NOTE_RULES: Array<{
  triggers: string[];
  positiveKeywords?: string[];
  excludeWhenOwned?: string[];
  themeBoosts?: Record<string, number>;
  tagBoosts?: Record<string, number>;
}> = [
  {
    triggers: ["narwhal", "jelly"],
    excludeWhenOwned: ["narwhal", "jelly"],
    positiveKeywords: ["friendship", "funny", "ocean", "sea", "comic"],
    themeBoosts: { "Laughs & Chaos": 14, "Wild & Wonderful": 6 },
    tagBoosts: { Funny: 8, Friendship: 6, Ocean: 6, Comics: 5 },
  },
  {
    triggers: ["zoey", "sassafras"],
    excludeWhenOwned: ["zoey", "sassafras"],
    positiveKeywords: ["magic", "science", "experiment", "dragon", "animal"],
    themeBoosts: { "Wonder & Imagination": 12, "Discovery Den": 10 },
    tagBoosts: { Magic: 8, Science: 8, Animals: 6, Dragons: 5 },
  },
  {
    triggers: ["pb", "j"],
    excludeWhenOwned: ["pb & j", "peanut butter", "jelly"],
    positiveKeywords: ["friendship", "funny", "silly", "school"],
    themeBoosts: { "Laughs & Chaos": 12, "Heart & Home": 8 },
    tagBoosts: { Funny: 8, Friendship: 6, School: 4 },
  },
  {
    triggers: ["magic tree"],
    excludeWhenOwned: ["magic tree house"],
    positiveKeywords: ["magic", "adventure", "quest", "history", "mystery"],
    themeBoosts: { Adventure: 14, "Wonder & Imagination": 10, "Legends & Long Ago": 6 },
    tagBoosts: { Adventure: 8, Magic: 7, History: 6, Mystery: 5 },
  },
  {
    triggers: ["magic"],
    positiveKeywords: ["magic", "wizard", "dragon", "unicorn", "fantasy"],
    themeBoosts: { "Wonder & Imagination": 10 },
    tagBoosts: { Magic: 8, Fantasy: 6, Dragons: 5, Unicorns: 5 },
  },
];

function normalizeText(value: string | null | undefined): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function addWeighted(target: Record<string, number>, source?: Record<string, number>) {
  for (const [key, value] of Object.entries(source ?? {})) {
    target[key] = (target[key] ?? 0) + value;
  }
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.map(value => value.trim()).filter(Boolean)));
}

export function buildNoteProfile(notes: string | null | undefined): NoteProfile {
  const normalized = normalizeText(notes);
  const ownedContext =
    normalized.includes("already have") ||
    normalized.includes("already own") ||
    normalized.includes("no more") ||
    normalized.includes("skip");
  const profile: NoteProfile = {
    excludeKeywords: [],
    positiveKeywords: [],
    themeBoosts: {},
    tagBoosts: {},
  };

  for (const rule of NOTE_RULES) {
    if (!rule.triggers.every(trigger => normalized.includes(normalizeText(trigger)))) {
      continue;
    }
    profile.positiveKeywords.push(...(rule.positiveKeywords ?? []));
    addWeighted(profile.themeBoosts, rule.themeBoosts);
    addWeighted(profile.tagBoosts, rule.tagBoosts);
    if (ownedContext) profile.excludeKeywords.push(...(rule.excludeWhenOwned ?? []));
  }

  return {
    excludeKeywords: unique(profile.excludeKeywords),
    positiveKeywords: unique(profile.positiveKeywords),
    themeBoosts: profile.themeBoosts,
    tagBoosts: profile.tagBoosts,
  };
}

export function scoreNoteMatch(input: {
  profile: NoteProfile;
  title?: string | null;
  author?: string | null;
  theme?: string | null;
  tags?: string[] | null;
}): { excluded: boolean; score: number; reasons: string[] } {
  const text = normalizeText([input.title, input.author, ...(input.tags ?? [])].join(" "));
  const theme = input.theme ?? "";
  const tags = input.tags ?? [];
  const reasons: string[] = [];

  const excludedBy = input.profile.excludeKeywords.find(keyword =>
    text.includes(normalizeText(keyword))
  );
  if (excludedBy) {
    return { excluded: true, score: 0, reasons: [`Avoids noted owned series: ${excludedBy}`] };
  }

  let score = input.profile.themeBoosts[theme] ?? 0;
  if (score > 0) reasons.push("Matches notes");

  for (const tag of tags) {
    const boost = input.profile.tagBoosts[tag] ?? 0;
    if (boost > 0) score += boost;
  }

  const keywordHits = input.profile.positiveKeywords.filter(keyword =>
    text.includes(normalizeText(keyword))
  );
  if (keywordHits.length > 0) {
    score += Math.min(18, keywordHits.length * 6);
    reasons.push(`Note keywords: ${keywordHits.slice(0, 3).join(", ")}`);
  }

  return { excluded: false, score, reasons };
}

export function getAvoidMatches(
  topicsToAvoid: string[] | null | undefined,
  input: {
    title?: string | null;
    author?: string | null;
    theme?: string | null;
    tags?: string[] | null;
  }
): string[] {
  const text = normalizeText([
    input.title,
    input.author,
    input.theme,
    ...(input.tags ?? []),
  ].join(" "));
  const matches: string[] = [];

  for (const topic of topicsToAvoid ?? []) {
    const keywords = AVOID_TO_THEMES[topic] ?? [];
    if (keywords.some(keyword => text.includes(normalizeText(keyword)))) {
      matches.push(topic);
    }
  }

  return matches;
}
