import { z } from "zod";
import { operatorProcedure, router } from "../../_core/trpc";
import {
  DEFAULT_SELECTION_ENGINE_SETTINGS,
  getCurrentSelectionSettings,
  resetSelectionSettings,
  updateSelectionSettings,
} from "../fulfillment/services/book-selection/selection.settings";

const strengthSchema = z.enum(["off", "low", "medium", "high"]);

const selectionSettingsInput = z.object({
  discoveryPicksPerShipment: z.number().int().min(0).max(3),
  interestMatchTargetPercentage: z.number().int().min(50).max(100),
  seriesContinuationStrength: strengthSchema,
  maximumSameSeriesPerShipment: z.number().int().min(1).max(3),
  authorDiversityStrength: strengthSchema,
  themeDiversityStrength: strengthSchema,
  inventoryHealthStrength: strengthSchema,
  readingProgressionStrength: strengthSchema,
  allowPreviouslySentInSuggestions: z.boolean(),
  excludePreviouslySentFromBundleCreation: z.boolean(),
  seasonalFiltering: z.boolean(),
  themeVariety: z.boolean(),
});

export const selectionSettingsRouter = router({
  get: operatorProcedure.query(async () => getCurrentSelectionSettings()),
  update: operatorProcedure
    .input(selectionSettingsInput)
    .mutation(async ({ input }) => updateSelectionSettings(input)),
  reset: operatorProcedure.mutation(async () => resetSelectionSettings()),
  defaults: operatorProcedure.query(() => DEFAULT_SELECTION_ENGINE_SETTINGS),
});
