import { ref, watchEffect } from "../deps/vue.mjs";

const KEY = "shortlist";

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return new Set(parsed);
    }
  } catch (_) {}
  return new Set();
}

export const shortlistSet = ref(load());

watchEffect(() => {
  try {
    localStorage.setItem(KEY, JSON.stringify([...shortlistSet.value]));
  } catch (_) {}
});

export const has = (slug) => shortlistSet.value.has(slug);

export const toggle = (slug) => {
  const next = new Set(shortlistSet.value);
  if (next.has(slug)) {
    next.delete(slug);
  } else {
    next.add(slug);
  }
  shortlistSet.value = next;
};

export const getAll = () => [...shortlistSet.value];
