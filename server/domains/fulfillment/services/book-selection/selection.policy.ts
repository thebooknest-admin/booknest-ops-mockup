export type BookSelectionPolicy = {
  allowPreviouslySentInSuggestions: boolean;
  excludePreviouslySentFromBundleCreation: boolean;
  excludeActiveAssignedCopies: boolean;
  seasonalFiltering: boolean;
  seasonalFilteringInSuggestions: boolean;
  themeVariety: boolean;
};

export const DEFAULT_BOOK_SELECTION_POLICY: BookSelectionPolicy = {
  allowPreviouslySentInSuggestions: true,
  excludePreviouslySentFromBundleCreation: true,
  excludeActiveAssignedCopies: true,
  seasonalFiltering: true,
  seasonalFilteringInSuggestions: false,
  themeVariety: true,
};

export function resolveBookSelectionPolicy(
  overrides?: Partial<BookSelectionPolicy>
): BookSelectionPolicy {
  return {
    ...DEFAULT_BOOK_SELECTION_POLICY,
    ...overrides,
  };
}
