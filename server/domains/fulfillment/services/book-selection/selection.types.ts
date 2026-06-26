export type SelectionReasonCode =
  | "age_match"
  | "interest_match"
  | "note_match"
  | "theme_variety"
  | "seasonal_allowed"
  | "seasonal_blocked"
  | "prior_title_penalty"
  | "active_copy_excluded"
  | "duplicate_title_excluded"
  | "avoided_topic_excluded"
  | "fallback_pick"
  | "author_diversity"
  | "theme_diversity"
  | "series_continue"
  | "series_order_blocked"
  | "inventory_health"
  | "reading_progression"
  | "premium_balance";

export type SelectionReasonTone = "positive" | "neutral" | "warning" | "blocked";

export type SelectionReason = {
  code: SelectionReasonCode;
  label: string;
  detail?: string;
  tone: SelectionReasonTone;
};

export type SelectionExclusion = {
  code: SelectionReasonCode;
  copy_id?: string | null;
  book_title_id?: string | null;
  title?: string | null;
  detail?: string;
};

export type BookSelectionMember = {
  id: string;
  name: string | null;
  tier: string | null;
  age_group: string | null;
  books_per_box?: number | null;
  topics_to_avoid?: string[] | null;
  notes?: string | null;
};

export type AvailableCopyWithTitle = {
  id: string;
  sku: string | null;
  bin_id: string | null;
  section: string | null;
  book_title_id: string;
  age_group?: string | null;
  book_titles: {
    id?: string;
    title: string | null;
    author: string | null;
    cover_url?: string | null;
    bin_theme: string | null;
    tag_ids: string[] | null;
    suggested_age_tier?: string | null;
    page_count?: number | null;
    premium_flag?: boolean | null;
    estimated_market_value?: number | null;
  } | null;
};

export type SuggestedBook = {
  book_title_id: string;
  title: string | null;
  author: string | null;
  cover_url: string | null;
  bin_theme: string | null;
  age_group: string | null | undefined;
  copy_id: string;
  sku: string | null;
  bin_id: string | null;
  in_house_count: number;
  score: number;
  already_sent: boolean;
  match_reason: string;
  selection_reasons: SelectionReason[];
  selection_reason_codes: SelectionReasonCode[];
};

export type SuggestBooksResult = {
  member_id: string;
  member_name: string | null;
  tier: string | null;
  age_group: string | null;
  books_needed: number;
  recommended: SuggestedBook[];
  all_suggestions: SuggestedBook[];
  fallback_start_index: number;
};

export type SelectedPickingCopy = AvailableCopyWithTitle;

export type PickingSelectionResult = {
  selectedCopies: SelectedPickingCopy[];
  noteMatchByCopyId: Map<string, { score: number; reasons: string[] }>;
  explanationsByCopyId: Map<string, SelectionReason[]>;
  exclusions: SelectionExclusion[];
  booksNeeded: number;
};
