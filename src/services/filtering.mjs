import { gigStatus } from "./festival.mjs";

/**
 * @param {object} artist
 * @param {object} activeFilters  { day, country, genre, location }
 * @param {Set}    shortlistSet
 * @param {string} mode  'all'|'today'|'now'|'soon'|'shortlist'
 * @param {number} nowMs
 * @returns {boolean}
 */
export const matchesFilters = (artist, activeFilters, shortlistSet, mode, nowMs) => {
  if (mode === "shortlist" && !shortlistSet.has(artist.slug)) return false;

  const { day, country, genre, location } = activeFilters;

  if (day && !artist.days.includes(day)) return false;
  if (country && !artist.country_ids.includes(country)) return false;
  if (genre && !artist.genres.includes(genre)) return false;
  if (location && !artist.locations.includes(location)) return false;

  if (mode === "now") {
    return artist.gigs.some((g) => gigStatus(g.start, nowMs) === "now");
  }
  if (mode === "soon") {
    return artist.gigs.some((g) => {
      const s = gigStatus(g.start, nowMs);
      return s === "now" || s === "soon";
    });
  }

  return true;
};

/**
 * For 'now'/'soon' modes, return only the matching gigs for each artist.
 * For 'today'/'all'/'shortlist', return all gigs (or filter by active day).
 */
export const visibleGigsFor = (artist, activeFilters, mode, nowMs) => {
  const { day } = activeFilters;

  if (mode === "now") {
    return artist.gigs.filter((g) => gigStatus(g.start, nowMs) === "now");
  }
  if (mode === "soon") {
    return artist.gigs.filter((g) => {
      const s = gigStatus(g.start, nowMs);
      return s === "now" || s === "soon";
    });
  }
  if (day) {
    return artist.gigs.filter((g) => g.day === day);
  }
  return artist.gigs;
};

export const sortArtistsAlpha = (artists) =>
  [...artists].sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }));

/**
 * Group gigs (with their parent artist attached) by hour bucket for the
 * time-grouped timetable view.
 *
 * Returns array of { label: "8pm", isoHour: "2026-05-13T20:00:00+01:00", entries: [{artist, gig}] }
 * sorted chronologically.
 */
export const groupGigsByHour = (artistsWithGigs) => {
  const buckets = new Map();

  for (const { artist, gigs } of artistsWithGigs) {
    for (const gig of gigs) {
      const d = new Date(gig.start);
      // Floor to the hour
      const hourMs = d.getTime() - (d.getMinutes() * 60_000) - (d.getSeconds() * 1_000) - d.getMilliseconds();
      if (!buckets.has(hourMs)) buckets.set(hourMs, []);
      buckets.get(hourMs).push({ artist, gig });
    }
  }

  return [...buckets.entries()]
    .sort(([a], [b]) => a - b)
    .map(([ms, entries]) => ({
      ms,
      entries: entries.sort((a, b) => new Date(a.gig.start) - new Date(b.gig.start)),
    }));
};
