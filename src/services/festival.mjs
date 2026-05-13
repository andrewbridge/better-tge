// Festival constants for TGE26.
// To roll over for a future year, change DAY_TO_DATE and FESTIVAL_NAME.
// Timezone is BST (UTC+1) for the duration of the festival.

export const FESTIVAL_NAME = "The Great Escape 2026";
export const TZ_OFFSET_MINUTES = 60; // BST = UTC+1

export const DAY_TO_DATE = {
  wednesday: "2026-05-13",
  thursday: "2026-05-14",
  friday: "2026-05-15",
  saturday: "2026-05-16",
};

export const DAY_ORDER = ["wednesday", "thursday", "friday", "saturday"];

export const FESTIVAL_START_ISO = "2026-05-13T00:00:00+01:00";
export const FESTIVAL_END_ISO = "2026-05-17T06:00:00+01:00"; // covers Sat→Sun early-AM sets

// Assumed maximum set length when computing the "on now" window.
// TGE sets typically run 30–45 minutes; we extend a little to catch the tail.
export const ASSUMED_SET_MINUTES = 50;

// "Next up" lookahead window for the soon mode.
export const SOON_WINDOW_MINUTES = 120;

/**
 * Classify a gig start time against the current moment.
 * @param {Date|number|string} start
 * @param {Date|number} now
 * @returns {'past'|'now'|'soon'|'future'}
 */
export const gigStatus = (start, now) => {
  const s = typeof start === "object" ? start.getTime() : new Date(start).getTime();
  const n = typeof now === "object" ? now.getTime() : now;
  const setEnd = s + ASSUMED_SET_MINUTES * 60_000;
  const soonStart = s - SOON_WINDOW_MINUTES * 60_000;
  if (n > setEnd) return "past";
  if (n >= s) return "now";
  if (n >= soonStart) return "soon";
  return "future";
};

/**
 * Resolve the festival "day" for a given moment, in Brighton time.
 * Late-night sets are typically labeled by the day they begin; we mirror that
 * by treating anything before 6am as the previous day. Returns null if the
 * given time is outside the festival window.
 */
export const festivalDayFor = (date) => {
  const d = typeof date === "object" ? date : new Date(date);
  // Convert to Brighton local time by adding the TZ offset, then reading UTC fields.
  const local = new Date(d.getTime() + TZ_OFFSET_MINUTES * 60_000);
  const y = local.getUTCFullYear();
  const m = String(local.getUTCMonth() + 1).padStart(2, "0");
  const day = String(local.getUTCDate()).padStart(2, "0");
  const hour = local.getUTCHours();
  let isoDate = `${y}-${m}-${day}`;
  if (hour < 6) {
    // Roll back to the previous calendar day.
    const prev = new Date(local.getTime() - 24 * 60 * 60_000);
    isoDate = `${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, "0")}-${String(prev.getUTCDate()).padStart(2, "0")}`;
  }
  for (const [name, iso] of Object.entries(DAY_TO_DATE)) {
    if (iso === isoDate) return name;
  }
  return null;
};

export const isDuringFestival = (date) => {
  const t = typeof date === "object" ? date.getTime() : new Date(date).getTime();
  return t >= new Date(FESTIVAL_START_ISO).getTime() && t <= new Date(FESTIVAL_END_ISO).getTime();
};
