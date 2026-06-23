/**
 * Phase 2B canonical inventory model proposal.
 *
 * This module is intentionally not imported by existing runtime code. It
 * defines the target vocabulary and migration helpers for a future, explicit
 * inventory migration without changing current behavior.
 */

export const CANONICAL_AGE_TIERS = [
  "hatchlings",
  "fledglings",
  "soarers",
  "sky_readers",
  "thirteen_plus",
] as const;

export type CanonicalAgeTier = (typeof CANONICAL_AGE_TIERS)[number];

export const AGE_TIER_LABELS: Record<CanonicalAgeTier, string> = {
  hatchlings: "Hatchlings",
  fledglings: "Fledglings",
  soarers: "Soarers",
  sky_readers: "Sky Readers",
  thirteen_plus: "13+",
};

export const AGE_TIER_DISPLAY_LABELS: Record<CanonicalAgeTier, string> = {
  hatchlings: "Hatchlings (0-2)",
  fledglings: "Fledglings (3-5)",
  soarers: "Soarers (6-8)",
  sky_readers: "Sky Readers (9-12)",
  thirteen_plus: "13+",
};

const AGE_TIER_ALIASES: Record<string, CanonicalAgeTier> = {
  hatchling: "hatchlings",
  hatchlings: "hatchlings",
  fledgling: "fledglings",
  fledglings: "fledglings",
  soarer: "soarers",
  soarers: "soarers",
  sky_reader: "sky_readers",
  sky_readers: "sky_readers",
  skyreader: "sky_readers",
  skyreaders: "sky_readers",
  "sky readers": "sky_readers",
  "13": "thirteen_plus",
  "13+": "thirteen_plus",
  thirteen_plus: "thirteen_plus",
  "thirteen plus": "thirteen_plus",
};

/** Normalizes existing storage keys and display values without changing them. */
export function normalizeLegacyAgeTier(
  value: string | null | undefined
): CanonicalAgeTier | null {
  const normalized = (value ?? "")
    .toLowerCase()
    .replace(/\s*\(.*\)\s*/g, "")
    .replace(/[-\s]+/g, "_")
    .trim();

  return (
    AGE_TIER_ALIASES[normalized] ??
    AGE_TIER_ALIASES[normalized.replace(/_/g, " ")] ??
    null
  );
}

export const PLAN_DEFINITIONS = {
  little_nest: { label: "Little Nest", book_count: 4 },
  cozy_nest: { label: "Cozy Nest", book_count: 6 },
  story_nest: { label: "Story Nest", book_count: 8 },
} as const;

export type CanonicalPlanCode = keyof typeof PLAN_DEFINITIONS;

export const LEGACY_PLAN_CODE_MAP: Record<string, CanonicalPlanCode> = {
  little_nest: "little_nest",
  "little-nest": "little_nest",
  "little nest": "little_nest",
  cozy_nest: "cozy_nest",
  "cozy-nest": "cozy_nest",
  "cozy nest": "cozy_nest",
  story_nest: "story_nest",
  "story-nest": "story_nest",
  "story nest": "story_nest",
};

/** Returns null for undefined legacy plans, including the mock-only Sky Nest. */
export function normalizeLegacyPlanCode(
  value: string | null | undefined
): CanonicalPlanCode | null {
  const normalized = (value ?? "").toLowerCase().trim();
  return LEGACY_PLAN_CODE_MAP[normalized] ?? null;
}

export const LABEL_STATUSES = ["pending", "printed", "not_required"] as const;
export type CanonicalLabelStatus = (typeof LABEL_STATUSES)[number];

export const SHIPMENT_STATUSES = [
  "picking",
  "packing",
  "packed",
  "shipped",
  "cancelled",
] as const;
export type CanonicalShipmentStatus = (typeof SHIPMENT_STATUSES)[number];

export const SHIPMENT_BOOK_STATUSES = [
  "ready_for_picking",
  "picked",
] as const;
export type CanonicalShipmentBookStatus =
  (typeof SHIPMENT_BOOK_STATUSES)[number];

export const RETURN_STATUSES = [
  "requested",
  "in_transit",
  "receiving",
  "received",
] as const;
export type CanonicalReturnStatus = (typeof RETURN_STATUSES)[number];

export const CIRCULATION_DISPOSITIONS = [
  "circulatable",
  "donated_out",
  "removed",
] as const;
export type CirculationDisposition = (typeof CIRCULATION_DISPOSITIONS)[number];

/**
 * Proposed target copy lifecycle. `return_processing` separates physical
 * receipt from the decision to put a book back into circulation.
 */
export const COPY_STATUSES = [
  "pending_qc",
  "pending_label",
  "pending_stock",
  "in_house",
  "reserved",
  "in_transit",
  "return_processing",
  "donated_out",
  "removed",
  "lost",
] as const;
export type CanonicalCopyStatus = (typeof COPY_STATUSES)[number];

export const TERMINAL_COPY_STATUSES = [
  "donated_out",
  "removed",
  "lost",
] as const satisfies readonly CanonicalCopyStatus[];

export const COPY_STATUS_TRANSITIONS: Record<
  CanonicalCopyStatus,
  readonly CanonicalCopyStatus[]
> = {
  pending_qc: ["pending_label", "pending_stock", "donated_out", "removed"],
  pending_label: ["pending_stock", "donated_out", "removed"],
  pending_stock: ["in_house", "donated_out", "removed"],
  in_house: ["reserved", "pending_qc", "donated_out", "removed"],
  reserved: ["in_house", "in_transit", "donated_out", "removed"],
  in_transit: ["return_processing", "lost", "removed"],
  return_processing: ["pending_qc", "in_house", "donated_out", "removed"],
  donated_out: [],
  removed: [],
  lost: [],
};

export function isValidCopyStatusTransition(
  from: CanonicalCopyStatus,
  to: CanonicalCopyStatus
): boolean {
  return COPY_STATUS_TRANSITIONS[from].includes(to);
}

export type LegacyCopyStatusMigration =
  | { action: "retain"; target: CanonicalCopyStatus }
  | { action: "map"; target: CanonicalCopyStatus; reason: string }
  | { action: "review"; reason: string };

/**
 * Future migration guidance only. It deliberately does not mutate or validate
 * current database values.
 */
export const LEGACY_COPY_STATUS_MIGRATIONS: Record<
  string,
  LegacyCopyStatusMigration
> = {
  pending_qc: { action: "retain", target: "pending_qc" },
  pending_label: { action: "retain", target: "pending_label" },
  pending_stock: { action: "retain", target: "pending_stock" },
  in_house: { action: "retain", target: "in_house" },
  reserved: { action: "retain", target: "reserved" },
  in_transit: { action: "retain", target: "in_transit" },
  donated_lfl: {
    action: "map",
    target: "donated_out",
    reason: "Unify donation-out destinations under one disposition.",
  },
  donated: {
    action: "map",
    target: "donated_out",
    reason: "Unify legacy donation-out statuses.",
  },
  withdrawn: {
    action: "map",
    target: "removed",
    reason: "Withdrawn copies are no longer in circulation.",
  },
  damaged: {
    action: "map",
    target: "removed",
    reason: "Damage is a reason for removal, not an ongoing copy status.",
  },
  retired: {
    action: "map",
    target: "removed",
    reason: "Retirement is a reason for removal, not an ongoing copy status.",
  },
  returned: {
    action: "review",
    reason:
      "Determine whether the copy is awaiting return processing or is already circulatable.",
  },
  restricted: {
    action: "review",
    reason:
      "Define an explicit restriction policy before mapping this ambiguous legacy status.",
  },
};

export function identifyLegacyCopyStatusMigration(
  status: string | null | undefined
): LegacyCopyStatusMigration {
  const normalized = (status ?? "").trim().toLowerCase();
  return (
    LEGACY_COPY_STATUS_MIGRATIONS[normalized] ?? {
      action: "review",
      reason: "Unknown legacy status; review before migration.",
    }
  );
}

export const INVENTORY_THEMES = [
  "Adventure",
  "Laughs & Chaos",
  "Heart & Home",
  "Wonder & Imagination",
  "Wild & Wonderful",
  "Discovery Den",
  "Legends & Long Ago",
  "Seasons & Celebrations",
] as const;
export type InventoryTheme = (typeof INVENTORY_THEMES)[number];

export type InventoryLocation = {
  age_tier: CanonicalAgeTier;
  theme: InventoryTheme;
  bin_code: string;
  section_code: string | null;
  display_code: string;
};

export function formatCanonicalLocationDisplayCode(input: {
  bin_code: string;
  section_code?: string | null;
}): string {
  const bin = input.bin_code.trim().toUpperCase();
  const section = (input.section_code ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z]/g, "");

  if (!section) return bin;
  return `${bin.replace(/-01$/, "")}-${section}`;
}