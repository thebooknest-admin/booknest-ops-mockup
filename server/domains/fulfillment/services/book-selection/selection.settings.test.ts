import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../supabase", () => ({
  sbJson: vi.fn(),
  sbVoid: vi.fn(),
}));

import { sbJson, sbVoid } from "../../../../supabase";
import {
  DEFAULT_SELECTION_ENGINE_SETTINGS,
  getCurrentSelectionSettings,
  getSelectionSettingsForEngine,
  resetSelectionSettings,
  settingsToSelectionConfig,
  settingsToSelectionPolicy,
  updateSelectionSettings,
} from "./selection.settings";

const mockedSbJson = vi.mocked(sbJson);
const mockedSbVoid = vi.mocked(sbVoid);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("selection engine settings", () => {
  it("falls back to defaults when no active row exists", async () => {
    mockedSbJson.mockResolvedValueOnce([]);

    await expect(getCurrentSelectionSettings()).resolves.toEqual({
      source: "defaults",
      settings: DEFAULT_SELECTION_ENGINE_SETTINGS,
      row_id: null,
      updated_at: null,
    });
  });

  it("uses defaults for the engine when the settings table is unavailable", async () => {
    mockedSbJson.mockRejectedValueOnce(new Error("relation does not exist"));

    await expect(getSelectionSettingsForEngine()).resolves.toMatchObject({
      source: "defaults",
      settings: DEFAULT_SELECTION_ENGINE_SETTINGS,
    });
  });

  it("maps loaded settings into selection config and policy overrides", async () => {
    const settings = {
      ...DEFAULT_SELECTION_ENGINE_SETTINGS,
      discoveryPicksPerShipment: 0,
      interestMatchTargetPercentage: 100,
      authorDiversityStrength: "high" as const,
      themeDiversityStrength: "off" as const,
      seasonalFiltering: false,
    };

    expect(settingsToSelectionConfig(settings)).toMatchObject({
      diversity: { repeatedAuthorPenalty: 24, repeatedThemePenalty: 0 },
      curation: { discoveryPicksPerShipment: 0, interestMatchTargetPercentage: 100 },
    });
    expect(settingsToSelectionPolicy(settings)).toMatchObject({ seasonalFiltering: false });
  });

  it("persists updated settings as the new active row", async () => {
    mockedSbVoid.mockResolvedValueOnce(undefined);
    mockedSbJson.mockResolvedValueOnce([{ id: "settings-1", active: true, config: DEFAULT_SELECTION_ENGINE_SETTINGS, updated_at: "now" }]);

    await expect(updateSelectionSettings(DEFAULT_SELECTION_ENGINE_SETTINGS)).resolves.toMatchObject({
      source: "database",
      row_id: "settings-1",
      settings: DEFAULT_SELECTION_ENGINE_SETTINGS,
    });
    expect(mockedSbVoid).toHaveBeenCalledWith("/selection_engine_settings?active=eq.true", expect.objectContaining({ method: "PATCH" }));
    expect(mockedSbJson).toHaveBeenCalledWith("/selection_engine_settings", expect.objectContaining({ method: "POST" }));
  });

  it("resets settings to defaults", async () => {
    mockedSbVoid.mockResolvedValueOnce(undefined);
    mockedSbJson.mockResolvedValueOnce([{ id: "settings-reset", active: true, config: DEFAULT_SELECTION_ENGINE_SETTINGS }]);

    await expect(resetSelectionSettings()).resolves.toMatchObject({
      source: "database",
      settings: DEFAULT_SELECTION_ENGINE_SETTINGS,
    });
  });
});
