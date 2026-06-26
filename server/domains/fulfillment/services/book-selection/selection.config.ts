export type SelectionEngineConfig = {
  score: {
    base: number;
    interestMatch: number;
    locatedCopy: number;
    inventoryHealthy: number;
    inventoryVeryHealthy: number;
    seriesContinuation: number;
    readingProgression: number;
  };
  diversity: {
    repeatedAuthorPenalty: number;
    repeatedThemePenalty: number;
    sameSeriesPenalty: number;
    pippasSurpriseMaxScoreGap: number;
  };
  curation: {
    discoveryPicksPerShipment: number;
    interestMatchTargetPercentage: number;
    maximumSameSeriesPerShipment: number;
  };
  thresholds: {
    healthyInventoryCount: number;
    veryHealthyInventoryCount: number;
    readingProgressionMaxPageDelta: number;
  };
};

export const DEFAULT_SELECTION_ENGINE_CONFIG: SelectionEngineConfig = {
  score: {
    base: 40,
    interestMatch: 30,
    locatedCopy: 5,
    inventoryHealthy: 6,
    inventoryVeryHealthy: 3,
    seriesContinuation: 24,
    readingProgression: 5,
  },
  diversity: {
    repeatedAuthorPenalty: 12,
    repeatedThemePenalty: 24,
    sameSeriesPenalty: 100,
    pippasSurpriseMaxScoreGap: 35,
  },
  curation: {
    discoveryPicksPerShipment: 1,
    interestMatchTargetPercentage: 85,
    maximumSameSeriesPerShipment: 1,
  },
  thresholds: {
    healthyInventoryCount: 3,
    veryHealthyInventoryCount: 5,
    readingProgressionMaxPageDelta: 80,
  },
};

export function resolveSelectionEngineConfig(
  overrides?: Partial<SelectionEngineConfig>
): SelectionEngineConfig {
  return {
    score: { ...DEFAULT_SELECTION_ENGINE_CONFIG.score, ...overrides?.score },
    diversity: { ...DEFAULT_SELECTION_ENGINE_CONFIG.diversity, ...overrides?.diversity },
    curation: { ...DEFAULT_SELECTION_ENGINE_CONFIG.curation, ...overrides?.curation },
    thresholds: { ...DEFAULT_SELECTION_ENGINE_CONFIG.thresholds, ...overrides?.thresholds },
  };
}
