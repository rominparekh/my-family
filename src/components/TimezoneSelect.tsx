"use client";

import { Select } from "@/components/ui";

// Full IANA timezone list from the runtime when available, with a sensible
// fallback for older engines.
function allZones(): string[] {
  const fn = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] })
    .supportedValuesOf;
  try {
    const v = fn?.("timeZone");
    if (Array.isArray(v) && v.length) return v;
  } catch {
    /* fall through */
  }
  return [
    "UTC",
    "America/Los_Angeles",
    "America/Denver",
    "America/Chicago",
    "America/New_York",
    "America/Sao_Paulo",
    "Europe/London",
    "Europe/Paris",
    "Europe/Berlin",
    "Asia/Dubai",
    "Asia/Kolkata",
    "Asia/Singapore",
    "Asia/Tokyo",
    "Australia/Sydney",
  ];
}

export default function TimezoneSelect({
  value,
  onChange,
  disabled,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  const zones = allZones();
  // Make sure the current value is always selectable, even if the runtime list
  // doesn't include it.
  const options = value && !zones.includes(value) ? [value, ...zones] : zones;

  return (
    <Select
      value={value}
      disabled={disabled}
      className={className}
      onChange={(e) => onChange(e.target.value)}
    >
      {options.map((z) => (
        <option key={z} value={z}>
          {z}
        </option>
      ))}
    </Select>
  );
}
