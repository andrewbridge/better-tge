export {
  createApp,
  ref,
  reactive,
  shallowReactive,
  shallowRef,
  computed,
  watch,
  watchEffect,
  onMounted,
  onUnmounted,
  onBeforeUnmount,
  nextTick,
  h,
  markRaw,
} from "https://unpkg.com/vue@3.4.27/dist/vue.esm-browser.js";

import { watchEffect } from "https://unpkg.com/vue@3.4.27/dist/vue.esm-browser.js";

export const persistRef = (refObj, key, permanent = true) => {
  const storage = permanent ? window.localStorage : window.sessionStorage;
  try {
    if (key in storage) {
      const raw = storage.getItem(key);
      if (raw !== null && raw !== "undefined") {
        refObj.value = JSON.parse(raw);
      }
    }
  } catch (_) {
    // ignore corrupt storage
  }
  watchEffect(() => {
    try {
      storage.setItem(key, JSON.stringify(refObj.value));
    } catch (_) {
      // quota or serialization issues — silently drop
    }
  });
};
