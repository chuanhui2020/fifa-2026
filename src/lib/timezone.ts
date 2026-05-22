export type TimezoneOption = "Asia/Shanghai" | "America/New_York" | "auto";

export const TIMEZONE_LABELS: Record<TimezoneOption, string> = {
  "Asia/Shanghai": "北京时间",
  "America/New_York": "美东时间",
  auto: "自动",
};

export function getResolvedTimezone(option: TimezoneOption): string {
  if (option === "auto") {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  }
  return option;
}

export function convertMatchTime(
  date: string,
  time: string,
  targetTimezone: string
): { date: string; time: string } {
  const [hour, minute] = time.split(":").map(Number);
  const etDate = new Date(`${date}T${time}:00-04:00`);

  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: targetTimezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(etDate);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value || "";

  const newDate = `${get("year")}-${get("month")}-${get("day")}`;
  const newHour = get("hour") === "24" ? "00" : get("hour");
  const newTime = `${newHour}:${get("minute")}`;

  return { date: newDate, time: newTime };
}
