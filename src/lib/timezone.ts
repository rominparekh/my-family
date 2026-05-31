import { DateTime } from "luxon";

// Hour of the friend's local day at which we deliver the wish.
const DELIVERY_HOUR_LOCAL = 9;

/** Today's date (YYYY-MM-DD) in the given IANA timezone. */
export function localToday(tz: string): string {
  return DateTime.now().setZone(zone(tz)).toFormat("yyyy-MM-dd");
}

function zone(tz: string): string {
  return DateTime.now().setZone(tz).isValid ? tz : "UTC";
}

/** Clamp Feb 29 to Feb 28 in non-leap years so the date is always valid. */
function safeDay(year: number, month: number, day: number): number {
  const dt = DateTime.fromObject({ year, month, day });
  if (dt.isValid) return day;
  const last = DateTime.fromObject({ year, month }).daysInMonth ?? day;
  return Math.min(day, last);
}

export interface Occurrence {
  /** The occasion date in the friend's tz, as YYYY-MM-DD. */
  occasionDate: string;
  /** When to deliver: DELIVERY_HOUR_LOCAL on the occasion date, as a UTC instant. */
  deliveryAt: Date;
  /** Whole days from now until the occasion date (in friend's tz). */
  daysUntil: number;
}

/**
 * Next upcoming occurrence of a (month, day) special day in the friend's tz.
 * If today is the occasion, returns today (daysUntil = 0).
 */
export function nextOccurrence(month: number, day: number, tz: string): Occurrence {
  const z = zone(tz);
  const now = DateTime.now().setZone(z);
  const todayStart = now.startOf("day");

  let year = now.year;
  let d = makeLocal(year, month, day, z);
  if (d.startOf("day") < todayStart) {
    year += 1;
    d = makeLocal(year, month, day, z);
  }

  const occasionStart = d.startOf("day");
  const daysUntil = Math.round(occasionStart.diff(todayStart, "days").days);
  const deliveryAt = occasionStart.set({ hour: DELIVERY_HOUR_LOCAL });

  return {
    occasionDate: occasionStart.toFormat("yyyy-MM-dd"),
    deliveryAt: deliveryAt.toUTC().toJSDate(),
    daysUntil,
  };
}

function makeLocal(year: number, month: number, day: number, z: string): DateTime {
  return DateTime.fromObject(
    { year, month, day: safeDay(year, month, day) },
    { zone: z }
  );
}

/** Human-friendly date for messages, e.g. "Sat, Jun 14". */
export function prettyDate(occasionDate: string, tz: string): string {
  return DateTime.fromISO(occasionDate, { zone: zone(tz) }).toFormat("ccc, LLL d");
}
