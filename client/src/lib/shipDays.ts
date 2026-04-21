export function getNextShipDay(): { isToday: boolean; dayName: string; label: string } {
  const today = new Date();
  const dow = today.getDay();
  if (dow === 2) return { isToday: true, dayName: "Tuesday", label: "Today (Tuesday)" };
  if (dow === 5) return { isToday: true, dayName: "Friday", label: "Today (Friday)" };
  const daysUntilTue = (2 - dow + 7) % 7;
  const daysUntilFri = (5 - dow + 7) % 7;
  const next = new Date(today);
  next.setDate(today.getDate() + Math.min(daysUntilTue, daysUntilFri));
  const label = next.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
  return { isToday: false, dayName: label, label };
}
