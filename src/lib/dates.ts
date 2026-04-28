export function getLocalDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getLocalTimeKey(date = new Date()): string {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
}

export function getLocalIsoWeekKey(date = new Date()): string {
  const localDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = localDate.getDay() || 7;
  localDate.setDate(localDate.getDate() + 4 - day);

  const weekYear = localDate.getFullYear();
  const yearStart = new Date(weekYear, 0, 1);
  const week = Math.ceil(((localDate.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);

  return `${weekYear}-W${String(week).padStart(2, "0")}`;
}
