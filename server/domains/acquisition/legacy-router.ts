/**
 * Temporary compatibility boundary for customer-acquisition routes.
 * These routes remain unchanged in Phase 1 and are intentionally isolated.
 */
import { legacyAppRouter } from "../_legacy/legacy-app-router";

export const welcomeRouter = legacyAppRouter.welcome;
export const signupsRouter = legacyAppRouter.signups;