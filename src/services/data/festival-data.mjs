import { shallowReactive, shallowRef } from "../../deps/vue.mjs";
import { signalDataReady, signalDataError } from "./lifecycle.mjs";

export const artists = shallowRef([]);
export const venues = shallowRef({});
export const distances = shallowRef({});
export const tracks = shallowRef([]);
export const filters = shallowReactive({
  country_options: [],
  day_options: [],
  genre_options: [],
  location_options: [],
});

const DATA_CACHE = "better-tge-data";
const DATA_URL = "data.json";

function applyData(data) {
  artists.value = data.artists || [];
  venues.value = data.venues || {};
  distances.value = data.distances || {};
  tracks.value = data.tracks || [];
  Object.assign(filters, data.filters || {});
}

async function loadFromCache() {
  if (!("caches" in self)) return null;
  const cache = await caches.open(DATA_CACHE);
  const res = await cache.match(DATA_URL);
  return res ? res.json() : null;
}

async function loadFromNetwork() {
  const res = await fetch(DATA_URL, { cache: "no-cache" });
  if (!res.ok) throw new Error(`data.json: HTTP ${res.status}`);
  if ("caches" in self) {
    const cache = await caches.open(DATA_CACHE);
    cache.put(DATA_URL, res.clone());
  }
  return res.json();
}

(async () => {
  let shownFromCache = false;
  try {
    const cached = await loadFromCache();
    if (cached) {
      applyData(cached);
      signalDataReady();
      shownFromCache = true;
    }
  } catch (_) {
    // fall through to network
  }

  try {
    const fresh = await loadFromNetwork();
    applyData(fresh);
    if (!shownFromCache) signalDataReady();
  } catch (err) {
    if (!shownFromCache) signalDataError(err);
  }
})();
