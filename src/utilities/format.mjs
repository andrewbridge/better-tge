import { TZ_OFFSET_MINUTES } from "../services/festival.mjs";

/**
 * Format a gig start ISO string as "8:30pm" in Brighton local time.
 */
export const formatTime = (isoStart) => {
  const d = new Date(isoStart);
  // Shift to Brighton local time by applying offset manually
  const local = new Date(d.getTime() + TZ_OFFSET_MINUTES * 60_000);
  let h = local.getUTCHours();
  const m = local.getUTCMinutes();
  const meridiem = h >= 12 ? "pm" : "am";
  h = h % 12 || 12;
  return m === 0 ? `${h}${meridiem}` : `${h}:${String(m).padStart(2, "0")}${meridiem}`;
};

/**
 * Format an hour bucket timestamp as "8pm", "12pm", etc.
 */
export const formatHourLabel = (ms) => {
  const local = new Date(ms + TZ_OFFSET_MINUTES * 60_000);
  let h = local.getUTCHours();
  const meridiem = h >= 12 ? "pm" : "am";
  h = h % 12 || 12;
  return `${h}${meridiem}`;
};

const VENUE_PRETTY = {
  "hope-and-ruin": "Hope & Ruin",
  "sticky-mike": "Sticky Mike's",
  "prince-albert": "Prince Albert",
  "one-church": "One Church",
  "daltons": "Daltons",
  "concorde-2": "Concorde 2",
  "patterns": "Patterns",
  "komedia": "Komedia",
  "the-great-escape": "TGE Stage",
};

export const venuePretty = (slug) =>
  VENUE_PRETTY[slug] || slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

const SERVICE_PRETTY = {
  spotify: "Spotify",
  youtube: "YouTube",
  facebook: "Facebook",
  twitter: "Twitter / X",
  instagram: "Instagram",
  soundcloud: "SoundCloud",
  tiktok: "TikTok",
  bandcamp: "Bandcamp",
  web: "Website",
};

export const servicePretty = (service) =>
  SERVICE_PRETTY[service] || service.charAt(0).toUpperCase() + service.slice(1);
