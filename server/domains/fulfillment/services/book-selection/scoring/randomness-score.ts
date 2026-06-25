export function selectWithThemeVariety<T>(
  scoredItems: Array<{ item: T; theme: string; score: number }>,
  count: number
): T[] {
  const maxPerTheme = Math.max(1, Math.ceil(count / 3));
  const selected: Array<{ item: T; theme: string; score: number }> = [];
  const selectedItems = new Set<T>();
  const themeCounts = new Map<string, number>();

  for (const row of scoredItems) {
    const themeCount = themeCounts.get(row.theme) ?? 0;
    if (themeCount >= maxPerTheme) continue;
    selected.push(row);
    selectedItems.add(row.item);
    themeCounts.set(row.theme, themeCount + 1);
    if (selected.length >= count) return selected.map(selectedRow => selectedRow.item);
  }

  for (const row of scoredItems) {
    if (selectedItems.has(row.item)) continue;
    selected.push(row);
    selectedItems.add(row.item);
    if (selected.length >= count) break;
  }

  return selected.map(row => row.item);
}
