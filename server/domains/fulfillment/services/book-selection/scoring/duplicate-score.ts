export function buildPriorTitleSet(rows: Array<{ book_title_id: string | null }>): Set<string> {
  return new Set(rows.map(row => row.book_title_id).filter(Boolean) as string[]);
}

export function buildActiveCopySet(rows: Array<{ book_copy_id: string | null }>): Set<string> {
  return new Set(rows.map(row => row.book_copy_id).filter(Boolean) as string[]);
}
