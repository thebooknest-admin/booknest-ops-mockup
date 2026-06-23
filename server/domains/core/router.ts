/** Non-domain application routes retained without contract changes. */
import { legacyAppRouter } from "../_legacy/legacy-app-router";

export const systemRouter = legacyAppRouter.system;
export const authRouter = legacyAppRouter.auth;
export const dashboardRouter = legacyAppRouter.dashboard;