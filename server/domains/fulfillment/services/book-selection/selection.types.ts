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
  booksNeeded: number;
};
