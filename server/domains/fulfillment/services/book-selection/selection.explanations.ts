import type { SelectionReason, SelectionReasonCode, SelectionReasonTone } from "./selection.types";

const REASON_LABELS: Record<SelectionReasonCode, string> = {
  age_match: "Age Match",
  interest_match: "Interest Match",
  note_match: "Note Match",
  theme_variety: "Theme Variety",
  seasonal_allowed: "Seasonal OK",
  seasonal_blocked: "Seasonal Blocked",
  prior_title_penalty: "Already Sent",
  active_copy_excluded: "Already Assigned",
  duplicate_title_excluded: "Duplicate Title Excluded",
  avoided_topic_excluded: "Avoided Topic Excluded",
  fallback_pick: "Fallback Pick",
};

const REASON_TONES: Record<SelectionReasonCode, SelectionReasonTone> = {
  age_match: "positive",
  interest_match: "positive",
  note_match: "positive",
  theme_variety: "neutral",
  seasonal_allowed: "neutral",
  seasonal_blocked: "warning",
  prior_title_penalty: "warning",
  active_copy_excluded: "blocked",
  duplicate_title_excluded: "blocked",
  avoided_topic_excluded: "blocked",
  fallback_pick: "neutral",
};

export function createSelectionReason(
  code: SelectionReasonCode,
  detail?: string
): SelectionReason {
  return {
    code,
    label: REASON_LABELS[code],
    detail,
    tone: REASON_TONES[code],
  };
}

export function selectionReasonCodes(reasons: SelectionReason[]): SelectionReasonCode[] {
  return reasons.map(reason => reason.code);
}
