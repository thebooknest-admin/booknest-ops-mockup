import { AVOID_TO_THEMES, INTEREST_TO_THEMES } from "../../../../../book-matching";

export function buildInterestThemeSet(interests: string[]): Set<string> {
  const matchThemes = new Set<string>();
  for (const category of interests) {
    for (const theme of INTEREST_TO_THEMES[category] ?? []) {
      matchThemes.add(theme);
    }
  }
  return matchThemes;
}

export function buildAvoidThemeSet(topicsToAvoid: string[] | null | undefined): Set<string> {
  const avoidThemes = new Set<string>();
  for (const topic of topicsToAvoid ?? []) {
    for (const theme of AVOID_TO_THEMES[topic] ?? []) {
      avoidThemes.add(theme);
    }
  }
  return avoidThemes;
}

export function getMatchedInterestCategories(input: {
  interests: string[];
  theme: string | null | undefined;
}): string[] {
  return input.interests.filter((category) =>
    (INTEREST_TO_THEMES[category] ?? []).includes(input.theme ?? "")
  );
}
