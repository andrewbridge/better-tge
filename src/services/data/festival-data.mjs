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

fetch("data.json")
  .then((r) => {
    if (!r.ok) throw new Error(`data.json: HTTP ${r.status}`);
    return r.json();
  })
  .then((data) => {
    artists.value = data.artists || [];
    venues.value = data.venues || {};
    distances.value = data.distances || {};
    tracks.value = data.tracks || [];
    Object.assign(filters, data.filters || {});
    signalDataReady();
  })
  .catch((err) => {
    signalDataError(err);
  });
