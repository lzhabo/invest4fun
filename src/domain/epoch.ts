export type InvestmentCadence = "daily" | "weekly" | "monthly";

export function cadenceEpoch(
  cadence: InvestmentCadence,
  date = new Date(),
  timezone = "UTC"
): string {
  const localDate = dateInTimezone(date, timezone);
  const day = localDate.toISOString().slice(0, 10);
  if (cadence === "daily") return `D:${day}`;
  if (cadence === "monthly") return `M:${day.slice(0, 7)}`;
  return `W:${weeklyEpoch(localDate)}`;
}

function dateInTimezone(date: Date, timezone: string): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  return new Date(Date.UTC(value("year"), value("month") - 1, value("day")));
}

export function weeklyEpoch(date = new Date()): string {
  const current = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = current.getUTCDay() || 7;
  current.setUTCDate(current.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(current.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((current.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${current.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}
