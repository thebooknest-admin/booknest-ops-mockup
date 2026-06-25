import { normalizeAgeGroup } from "@shared/booknest";

export function getSelectionAgeGroup(ageGroup: string | null | undefined): string | null | undefined {
  return normalizeAgeGroup(ageGroup) ?? ageGroup;
}
