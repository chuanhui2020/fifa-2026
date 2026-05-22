"use client";

import { TimezoneOption, TIMEZONE_LABELS } from "@/lib/timezone";
import { useTimezone } from "./TimezoneProvider";

const options: TimezoneOption[] = ["Asia/Shanghai", "America/New_York", "auto"];

export function TimezoneSelector() {
  const { timezone, setTimezone } = useTimezone();

  return (
    <div className="flex items-center gap-1" role="group" aria-label="时区选择">
      {options.map((tz) => (
        <button
          key={tz}
          onClick={() => setTimezone(tz)}
          className={`px-2 py-1 rounded text-xs font-medium transition-colors duration-150 cursor-pointer ${
            timezone === tz
              ? "bg-upcoming text-white"
              : "text-muted hover:text-foreground"
          }`}
        >
          {TIMEZONE_LABELS[tz]}
        </button>
      ))}
    </div>
  );
}
