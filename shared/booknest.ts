export const AGE_GROUP_KEYS = [
  "hatchlings",
  "fledglings",
  "soarers",
  "sky_readers",
] as const;

export type AgeGroupKey = (typeof AGE_GROUP_KEYS)[number];

export const AGE_GROUP_LABELS: Record<AgeGroupKey, string> = {
  hatchlings: "Hatchlings",
  fledglings: "Fledglings",
  soarers: "Soarers",
  sky_readers: "Sky Readers",
};

export const AGE_GROUP_DISPLAY: Record<AgeGroupKey, string> = {
  hatchlings: "Hatchlings (0-2)",
  fledglings: "Fledglings (3-5)",
  soarers: "Soarers (6-8)",
  sky_readers: "Sky Readers (9-12)",
};

export const SKU_PREFIX_BY_AGE_GROUP: Record<AgeGroupKey, string> = {
  hatchlings: "HATCH",
  fledglings: "FLED",
  soarers: "SOAR",
  sky_readers: "SKY",
};

export const BIN_CODE_BY_THEME: Record<string, string> = {
  "Adventure": "ADV",
  "Laughs & Chaos": "LCH",
  "Heart & Home": "HRT",
  "Wonder & Imagination": "WND",
  "Wild & Wonderful": "WLD",
  "Discovery Den": "DSC",
  "Legends & Long Ago": "LEG",
  "Seasons & Celebrations": "SEA",
};

export const BOOK_COPY_STATUSES = {
  pendingQc: "pending_qc",
  pendingLabel: "pending_label",
  pendingStock: "pending_stock",
  inHouse: "in_house",
  reserved: "reserved",
  inTransit: "in_transit",
  returned: "returned",
  donatedLfl: "donated_lfl",
  lost: "lost",
  withdrawn: "withdrawn",
} as const;

export const TERMINAL_BOOK_COPY_STATUSES = new Set<string>([
  BOOK_COPY_STATUSES.donatedLfl,
  BOOK_COPY_STATUSES.lost,
  BOOK_COPY_STATUSES.withdrawn,
  "damaged",
  "retired",
]);

export const LABEL_STATUSES = {
  pending: "pending",
  printed: "printed",
  notRequired: "not_required",
} as const;

export type BookCopyStatus =
  (typeof BOOK_COPY_STATUSES)[keyof typeof BOOK_COPY_STATUSES];

export function normalizeAgeGroup(
  value: string | null | undefined
): AgeGroupKey | null {
  const normalized = (value ?? "")
    .toLowerCase()
    .replace(/\s*\(.*\)\s*/g, "")
    .replace(/[-\s]+/g, "_")
    .trim();

  if (normalized.includes("hatch")) return "hatchlings";
  if (normalized.includes("fledg")) return "fledglings";
  if (normalized.includes("soar")) return "soarers";
  if (
    normalized.includes("sky_reader") ||
    normalized.includes("skyread") ||
    normalized.includes("sky")
  ) {
    return "sky_readers";
  }

  return null;
}

export function getAgeGroupLabel(value: string | null | undefined): string {
  const key = normalizeAgeGroup(value);
  return key ? AGE_GROUP_LABELS[key] : value ?? "";
}

export function getSkuPrefixForAgeGroup(
  value: string | null | undefined
): string {
  const key = normalizeAgeGroup(value);
  return key ? SKU_PREFIX_BY_AGE_GROUP[key] : "UNK";
}

export function getBinCodeForAgeGroupAndTheme(
  ageGroup: string | null | undefined,
  theme: string | null | undefined
): string | null {
  const key = normalizeAgeGroup(ageGroup);
  const themeCode = theme ? BIN_CODE_BY_THEME[theme] : null;

  if (!key || !themeCode) return null;

  return `${SKU_PREFIX_BY_AGE_GROUP[key]}-${themeCode}-01`;
}
