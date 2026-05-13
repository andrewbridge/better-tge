import { css, glob } from "../deps/goober.mjs";
import { ref, watch } from "../deps/vue.mjs";
import { apiKey, model, AVAILABLE_MODELS } from "../services/settings.mjs";
import { trapFocus } from "../utilities/focus-trap.mjs";

glob`body.settings-open { overflow: hidden; }`;

const cls = css`
  position: fixed;
  inset: 0;
  z-index: 300;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;

  .backdrop {
    position: absolute;
    inset: 0;
    background: rgba(0,0,0,0.55);
  }

  .panel {
    position: relative;
    background: var(--paper);
    border: 2px solid var(--rule);
    box-shadow: 6px 6px 0 var(--rule);
    width: 100%;
    max-width: 420px;
    padding: 1.5rem;
  }

  h2 {
    font-family: 'Bowlby One', sans-serif;
    font-size: 1.2rem;
    margin: 0 0 1.25rem;
    color: var(--ink);
  }

  .field {
    margin-bottom: 1rem;

    label {
      display: block;
      font-family: 'Space Mono', monospace;
      font-size: 0.65rem;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--muted);
      margin-bottom: 0.35rem;
    }

    input, select {
      width: 100%;
      font-family: 'Space Mono', monospace;
      font-size: 0.75rem;
      background: var(--paper);
      border: 1.5px solid var(--rule);
      padding: 0.45rem 0.6rem;
      color: var(--ink);
      box-shadow: 2px 2px 0 var(--rule);
      appearance: none;

      &:focus { outline: 2px solid var(--hot); outline-offset: 1px; }
    }
  }

  .hint {
    font-family: 'Space Mono', monospace;
    font-size: 0.62rem;
    color: var(--muted);
    margin-top: 0.25rem;
    line-height: 1.5;
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    margin-top: 1.5rem;

    button {
      font-family: 'Space Mono', monospace;
      font-size: 0.7rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      padding: 0.45rem 1rem;
      border: 1.5px solid var(--rule);
      box-shadow: 2px 2px 0 var(--rule);
      cursor: pointer;
      background: var(--paper);
      color: var(--ink);

      &.primary {
        background: var(--ink);
        color: var(--paper);
      }

      &:hover:not(.primary) { background: var(--tint); }
      &:focus { outline: 2px solid var(--hot); outline-offset: 1px; }
    }
  }

  .close-btn {
    position: absolute;
    top: 0.75rem;
    right: 0.75rem;
    background: none;
    border: none;
    font-size: 1rem;
    cursor: pointer;
    color: var(--muted);
    padding: 0.25rem;
    line-height: 1;

    &:hover { color: var(--ink); }
  }
`;

export default {
  name: "SettingsModal",
  emits: ["close"],
  setup(_, { emit }) {
    const localKey = ref(apiKey.value);
    const localModel = ref(model.value);
    let release = null;

    function save() {
      apiKey.value = localKey.value.trim();
      model.value = localModel.value;
      emit("close");
    }

    function onKeydown(e) {
      if (e.key === "Escape") emit("close");
    }

    return {
      localKey,
      localModel,
      models: AVAILABLE_MODELS,
      save,
      onKeydown,
    };
  },
  mounted() {
    document.body.classList.add("settings-open");
    document.addEventListener("keydown", this.onKeydown);
    this._release = trapFocus(this.$el.querySelector(".panel"));
  },
  beforeUnmount() {
    document.body.classList.remove("settings-open");
    document.removeEventListener("keydown", this.onKeydown);
    if (this._release) this._release();
  },
  template: `
    <teleport to="#teleport-root">
      <div :class="$options.cls" role="dialog" aria-modal="true" aria-label="Settings">
        <div class="backdrop" @click="$emit('close')"></div>
        <div class="panel">
          <button class="close-btn" @click="$emit('close')" aria-label="Close">✕</button>
          <h2>Settings</h2>

          <div class="field">
            <label for="api-key">OpenRouter API key</label>
            <input
              id="api-key"
              v-model="localKey"
              type="password"
              autocomplete="off"
              spellcheck="false"
              placeholder="sk-or-…"
            />
            <p class="hint">
              Get a free key at openrouter.ai — used only in your browser, never stored on a server.
            </p>
          </div>

          <div class="field">
            <label for="model-select">AI model</label>
            <select id="model-select" v-model="localModel">
              <option v-for="m in models" :key="m.id" :value="m.id">{{ m.label }}</option>
            </select>
          </div>

          <div class="actions">
            <button @click="$emit('close')">Cancel</button>
            <button class="primary" @click="save">Save</button>
          </div>
        </div>
      </div>
    </teleport>
  `,
  cls,
};
