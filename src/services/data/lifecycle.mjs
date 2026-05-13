import { ref } from "../../deps/vue.mjs";

const dom = Promise.withResolvers();
const data = Promise.withResolvers();

export const signalDOMReady = () => dom.resolve();
export const signalDataReady = () => data.resolve();
export const signalDataError = (err) => data.reject(err);

export const applicationReady = ref(false);
export const applicationError = ref(null);

Promise.all([dom.promise, data.promise])
  .then(() => { applicationReady.value = true; })
  .catch((err) => { applicationError.value = err; });
