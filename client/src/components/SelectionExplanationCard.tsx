type SelectionExplanation = {
  code?: string;
  label?: string;
  detail?: string;
  tone?: string;
};

type SelectionMetadata = {
  final_score?: number | null;
  score_breakdown?: Record<string, number> | null;
  explanation_codes?: string[] | null;
  explanation_labels?: string[] | null;
  explanations?: SelectionExplanation[] | null;
  author_diversity_adjustment?: number | null;
  theme_diversity_adjustment?: number | null;
  series_continuation?: {
    series_key?: string | null;
    series_label?: string | null;
    book_number?: number | null;
    continued_existing_series?: boolean | null;
  } | null;
  reading_progression_adjustment?: number | null;
  inventory_health_adjustment?: number | null;
  pippas_surprise?: boolean | null;
  selected_at?: string | null;
};

const BADGE_LABELS: Record<string, string> = {
  age_match: "Age Match",
  interest_match: "Interest Match",
  series_continue: "Series Continuation",
  theme_diversity: "Theme Variety",
  theme_variety: "Theme Variety",
  reading_progression: "Reading Progression",
  inventory_health: "Inventory Health",
  author_diversity: "Author Diversity",
  pippas_surprise: "Pippa's Surprise",
};

const BADGE_CODES = Object.keys(BADGE_LABELS);

function getBadgeCodes(metadata: SelectionMetadata) {
  const codes = new Set(metadata.explanation_codes ?? []);
  if ((metadata.author_diversity_adjustment ?? 0) !== 0) codes.add("author_diversity");
  if ((metadata.theme_diversity_adjustment ?? 0) !== 0) codes.add("theme_diversity");
  if ((metadata.inventory_health_adjustment ?? 0) !== 0) codes.add("inventory_health");
  if ((metadata.reading_progression_adjustment ?? 0) !== 0) codes.add("reading_progression");
  if (metadata.series_continuation?.continued_existing_series) codes.add("series_continue");
  if (metadata.pippas_surprise) codes.add("pippas_surprise");
  return BADGE_CODES.filter(code => codes.has(code));
}

export function SelectionExplanationCard({ metadata }: { metadata?: SelectionMetadata | null }) {
  if (!metadata) return null;

  const badges = getBadgeCodes(metadata);
  const explanations = metadata.explanations ?? [];
  const series = metadata.series_continuation;

  return (
    <details className="mt-3 rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-xs">
      <summary className="cursor-pointer font-semibold text-foreground">
        Why this book?
      </summary>
      <div className="mt-2 space-y-2">
        {badges.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {badges.map(code => (
              <span
                key={code}
                className="rounded-full border border-border bg-background px-2 py-0.5 font-medium text-muted-foreground"
              >
                {BADGE_LABELS[code]}
              </span>
            ))}
          </div>
        )}

        {typeof metadata.final_score === "number" && (
          <p className="text-muted-foreground">Final score: {metadata.final_score}</p>
        )}

        {series?.series_label && (
          <p className="text-muted-foreground">
            Series: {series.series_label}{series.book_number ? ` #${series.book_number}` : ""}
          </p>
        )}

        {explanations.length > 0 && (
          <ul className="space-y-1 text-muted-foreground">
            {explanations.map((reason, index) => (
              <li key={`${reason.code ?? reason.label}-${index}`}>
                <span className="font-medium text-foreground">{reason.label ?? reason.code}</span>
                {reason.detail ? ` — ${reason.detail}` : ""}
              </li>
            ))}
          </ul>
        )}
      </div>
    </details>
  );
}