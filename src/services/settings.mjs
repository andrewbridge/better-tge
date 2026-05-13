import { ref, watchEffect } from "../deps/vue.mjs";

const KEY_API = "or_api_key";
const KEY_MODEL = "or_model";

export const DEFAULT_MODEL = "anthropic/claude-sonnet-4-6";

export const AVAILABLE_MODELS = [
  { id: "anthropic/claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
  { id: "anthropic/claude-haiku-4-5", label: "Claude Haiku 4.5" },
  { id: "google/gemini-2.0-flash-001", label: "Gemini 2.0 Flash" },
  { id: "openai/gpt-4o-mini", label: "GPT-4o Mini" },
];

export const apiKey = ref(localStorage.getItem(KEY_API) || "");
export const model = ref(localStorage.getItem(KEY_MODEL) || DEFAULT_MODEL);

watchEffect(() => { localStorage.setItem(KEY_API, apiKey.value); });
watchEffect(() => { localStorage.setItem(KEY_MODEL, model.value); });
