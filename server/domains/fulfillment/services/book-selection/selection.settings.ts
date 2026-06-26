import { sbJson, sbVoid } from "../../../../supabase";
import type { BookSelectionPolicy } from "./selection.policy";
import { DEFAULT_BOOK_SELECTION_POLICY } from "./selection.policy";
import type { SelectionEngineConfig } from "./selection.config";
import { DEFAULT_SELECTION_ENGINE_CONFIG } from "./selection.config";

export type SelectionStrength = "off" | "low" | "medium" | "high";

export type SelectionEngineSettings = {
  discoveryPicksPerShipment: number;
  interestMatchTargetPercentage: number;
  seriesContinuationStrength: SelectionStrength;
  maximumSameSeriesPerShipment: number;
  authorDiversityStrength: SelectionStrength;
  themeDiversityStrength: SelectionStrength;
  inventoryHealthStrength: SelectionStrength;
  readingProgressionStrength: SelectionStrength;
  allowPreviouslySentInSuggestions: boolean;
  excludePreviouslySentFromBundleCreation: boolean;
  seasonalFiltering: boolean;
  themeVariety: boolean;
};

type SelectionSettingsRow = {
  id: string;
  config: Partial<SelectionEngineSettings> | null;
  active: boolean;
  created_at?: string | null;
  updated_at?: string | null;
};

export type SelectionSettingsSource = "database" | "defaults";

export type SelectionSettingsResponse = {
  source: SelectionSettingsSource;
  settings: SelectionEngineSettings;
  row_id: string | null;
  updated_at: string | null;
};

export const DEFAULT_SELECTION_ENGINE_SETTINGS: SelectionEngineSettings = {
  discoveryPicksPerShipment: 1,
  interestMatchTargetPercentage: 85,
  seriesContinuationStrength: "high",
  maximumSameSeriesPerShipment: 1,
  authorDiversityStrength: "low",
  themeDiversityStrength: "high",
  inventoryHealthStrength: "medium",
  readingProgressionStrength: "low",
  allowPreviouslySentInSuggestions: DEFAULT_BOOK_SELECTION_POLICY.allowPreviouslySentInSuggestions,
  excludePreviouslySentFromBundleCreation: DEFAULT_BOOK_SELECTION_POLICY.excludePreviouslySentFromBundleCreation,
  seasonalFiltering: DEFAULT_BOOK_SELECTION_POLICY.seasonalFiltering,
  themeVariety: DEFAULT_BOOK_SELECTION_POLICY.themeVariety,
};

const SERIES_STRENGTH: Record<SelectionStrength, number> = {
  off: 0,
  low: 8,
  medium: 16,
  high: 24,
};

const DIVERSITY_STRENGTH: Record<SelectionStrength, number> = {
  off: 0,
  low: 12,
  medium: 18,
  high: 24,
};

const INVENTORY_STRENGTH: Record<SelectionStrength, { healthy: number; veryHealthy: number }> = {
  off: { healthy: 0, veryHealthy: 0 },
  low: { healthy: 3, veryHealthy: 2 },
  medium: { healthy: 6, veryHealthy: 3 },
  high: { healthy: 10, veryHealthy: 5 },
};

const READING_STRENGTH: Record<SelectionStrength, number> = {
  off: 0,
  low: 5,
  medium: 10,
  high: 15,
};

function clampInteger(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

function normalizeStrength(value: unknown, fallback: SelectionStrength): SelectionStrength {
  return value === "off" || value === "low" || value === "medium" || value === "high"
    ? value
    : fallback;
}

export function normalizeSelectionEngineSettings(
  input?: Partial<SelectionEngineSettings> | null
): SelectionEngineSettings {
  const defaults = DEFAULT_SELECTION_ENGINE_SETTINGS;
  return {
    discoveryPicksPerShipment: clampInteger(input?.discoveryPicksPerShipment, defaults.discoveryPicksPerShipment, 0, 3),
    interestMatchTargetPercentage: clampInteger(input?.interestMatchTargetPercentage, defaults.interestMatchTargetPercentage, 50, 100),
    seriesContinuationStrength: normalizeStrength(input?.seriesContinuationStrength, defaults.seriesContinuationStrength),
    maximumSameSeriesPerShipment: clampInteger(input?.maximumSameSeriesPerShipment, defaults.maximumSameSeriesPerShipment, 1, 3),
    authorDiversityStrength: normalizeStrength(input?.authorDiversityStrength, defaults.authorDiversityStrength),
    themeDiversityStrength: normalizeStrength(input?.themeDiversityStrength, defaults.themeDiversityStrength),
    inventoryHealthStrength: normalizeStrength(input?.inventoryHealthStrength, defaults.inventoryHealthStrength),
    readingProgressionStrength: normalizeStrength(input?.readingProgressionStrength, defaults.readingProgressionStrength),
    allowPreviouslySentInSuggestions: input?.allowPreviouslySentInSuggestions ?? defaults.allowPreviouslySentInSuggestions,
    excludePreviouslySentFromBundleCreation: input?.excludePreviouslySentFromBundleCreation ?? defaults.excludePreviouslySentFromBundleCreation,
    seasonalFiltering: input?.seasonalFiltering ?? defaults.seasonalFiltering,
    themeVariety: input?.themeVariety ?? defaults.themeVariety,
  };
}

export function settingsToSelectionConfig(settings: SelectionEngineSettings): Partial<SelectionEngineConfig> {
  const inventory = INVENTORY_STRENGTH[settings.inventoryHealthStrength];
  return {
    score: {
      ...DEFAULT_SELECTION_ENGINE_CONFIG.score,
      seriesContinuation: SERIES_STRENGTH[settings.seriesContinuationStrength],
      inventoryHealthy: inventory.healthy,
      inventoryVeryHealthy: inventory.veryHealthy,
      readingProgression: READING_STRENGTH[settings.readingProgressionStrength],
    },
    diversity: {
      ...DEFAULT_SELECTION_ENGINE_CONFIG.diversity,
      repeatedAuthorPenalty: DIVERSITY_STRENGTH[settings.authorDiversityStrength],
      repeatedThemePenalty: DIVERSITY_STRENGTH[settings.themeDiversityStrength],
    },
    curation: {
      ...DEFAULT_SELECTION_ENGINE_CONFIG.curation,
      discoveryPicksPerShipment: settings.discoveryPicksPerShipment,
      interestMatchTargetPercentage: settings.interestMatchTargetPercentage,
      maximumSameSeriesPerShipment: settings.maximumSameSeriesPerShipment,
    },
  };
}

export function settingsToSelectionPolicy(settings: SelectionEngineSettings): Partial<BookSelectionPolicy> {
  return {
    allowPreviouslySentInSuggestions: settings.allowPreviouslySentInSuggestions,
    excludePreviouslySentFromBundleCreation: settings.excludePreviouslySentFromBundleCreation,
    seasonalFiltering: settings.seasonalFiltering,
    seasonalFilteringInSuggestions: DEFAULT_BOOK_SELECTION_POLICY.seasonalFilteringInSuggestions,
    themeVariety: settings.themeVariety,
    excludeActiveAssignedCopies: DEFAULT_BOOK_SELECTION_POLICY.excludeActiveAssignedCopies,
  };
}

async function fetchActiveSettingsRow(): Promise<SelectionSettingsRow | null> {
  const rows = await sbJson<SelectionSettingsRow[]>(
    "/selection_engine_settings?active=eq.true&order=updated_at.desc&limit=1"
  );
  return rows[0] ?? null;
}

export async function getCurrentSelectionSettings(): Promise<SelectionSettingsResponse> {
  const row = await fetchActiveSettingsRow();
  if (!row) {
    return {
      source: "defaults",
      settings: DEFAULT_SELECTION_ENGINE_SETTINGS,
      row_id: null,
      updated_at: null,
    };
  }

  return {
    source: "database",
    settings: normalizeSelectionEngineSettings(row.config),
    row_id: row.id,
    updated_at: row.updated_at ?? null,
  };
}

export async function getSelectionSettingsForEngine(): Promise<SelectionSettingsResponse> {
  try {
    return await getCurrentSelectionSettings();
  } catch {
    return {
      source: "defaults",
      settings: DEFAULT_SELECTION_ENGINE_SETTINGS,
      row_id: null,
      updated_at: null,
    };
  }
}

export async function updateSelectionSettings(
  input: Partial<SelectionEngineSettings>
): Promise<SelectionSettingsResponse> {
  const settings = normalizeSelectionEngineSettings(input);
  const now = new Date().toISOString();

  await sbVoid("/selection_engine_settings?active=eq.true", {
    method: "PATCH",
    body: JSON.stringify({ active: false, updated_at: now }),
    headers: { Prefer: "return=minimal" },
  });

  const rows = await sbJson<SelectionSettingsRow[]>("/selection_engine_settings", {
    method: "POST",
    body: JSON.stringify({ config: settings, active: true, created_at: now, updated_at: now }),
    headers: { Prefer: "return=representation" },
  });

  const row = rows[0] ?? null;
  return {
    source: "database",
    settings,
    row_id: row?.id ?? null,
    updated_at: row?.updated_at ?? now,
  };
}

export async function resetSelectionSettings(): Promise<SelectionSettingsResponse> {
  return updateSelectionSettings(DEFAULT_SELECTION_ENGINE_SETTINGS);
}
