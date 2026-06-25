export type HolidayWindow = {
  keywords: string[];
  month: number;
  day: number;
  beforeDays: number;
  afterDays: number;
};

export const HOLIDAY_WINDOWS: HolidayWindow[] = [
  { keywords: ["christmas", "santa", "reindeer", "nativity", "noel"], month: 12, day: 25, beforeDays: 45, afterDays: 7 },
  { keywords: ["halloween", "trick", "pumpkin", "ghost", "spooky"], month: 10, day: 31, beforeDays: 45, afterDays: 3 },
  { keywords: ["thanksgiving", "turkey", "pilgrim"], month: 11, day: 26, beforeDays: 28, afterDays: 3 },
  { keywords: ["easter", "bunny", "egg hunt"], month: 4, day: 5, beforeDays: 35, afterDays: 7 },
  { keywords: ["valentine", "valentine's day"], month: 2, day: 14, beforeDays: 28, afterDays: 3 },
];

export function daysBetweenDates(a: Date, b: Date): number {
  const aUtc = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const bUtc = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((aUtc - bUtc) / 86_400_000);
}

export function isDateInHolidayWindow(date: Date, window: HolidayWindow): boolean {
  for (const year of [date.getFullYear() - 1, date.getFullYear(), date.getFullYear() + 1]) {
    const holiday = new Date(year, window.month - 1, window.day);
    const delta = daysBetweenDates(date, holiday);
    if (delta >= -window.beforeDays && delta <= window.afterDays) return true;
  }
  return false;
}

export function isSeasonalBookAllowed(input: {
  title?: string | null;
  tags?: string[] | null;
  referenceDate?: Date;
}): boolean {
  const haystack = [input.title ?? "", ...(input.tags ?? [])]
    .join(" ")
    .toLowerCase();
  const matchedWindow = HOLIDAY_WINDOWS.find(window =>
    window.keywords.some(keyword => haystack.includes(keyword))
  );
  if (!matchedWindow) return true;
  return isDateInHolidayWindow(input.referenceDate ?? new Date(), matchedWindow);
}
