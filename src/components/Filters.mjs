import { css } from "../deps/goober.mjs";

const cls = css`
  background: var(--tint);
  border-bottom: 2px solid var(--rule);
  padding: 0.6rem 1rem;
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;

  select {
    font-family: 'Space Mono', monospace;
    font-size: 0.7rem;
    background: var(--paper);
    border: 1.5px solid var(--rule);
    padding: 0.3rem 0.5rem;
    color: var(--ink);
    box-shadow: 2px 2px 0 var(--rule);
    cursor: pointer;
    appearance: none;
    min-width: 7rem;

    &:focus { outline: 2px solid var(--hot); outline-offset: 1px; }
  }

  .clear-btn {
    font-family: 'Space Mono', monospace;
    font-size: 0.65rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    background: none;
    border: 1.5px solid var(--rule);
    padding: 0.3rem 0.6rem;
    cursor: pointer;
    box-shadow: 2px 2px 0 var(--rule);
    color: var(--ink);

    &:hover { background: var(--hot); color: var(--paper); border-color: var(--hot); }
  }
`;

export default {
  name: "FilterBar",
  props: {
    modelValue: { type: Object, required: true },
    filterOptions: { type: Object, required: true },
    mode: { type: String, required: true },
  },
  emits: ["update:modelValue"],
  computed: {
    hasActiveFilters() {
      const f = this.modelValue;
      return f.day || f.country || f.genre || f.location;
    },
    showDayFilter() {
      return !["today", "now", "soon"].includes(this.mode);
    },
  },
  methods: {
    update(key, val) {
      this.$emit("update:modelValue", { ...this.modelValue, [key]: val });
    },
    clear() {
      this.$emit("update:modelValue", { day: "", country: "", genre: "", location: "" });
    },
  },
  template: `
    <div :class="$options.cls">
      <select v-if="showDayFilter" :value="modelValue.day" @change="update('day', $event.target.value)" aria-label="Filter by day">
        <option value="">All days</option>
        <option v-for="o in filterOptions.day_options" :key="o.val" :value="o.val">{{ o.txt }}</option>
      </select>

      <select :value="modelValue.country" @change="update('country', $event.target.value)" aria-label="Filter by country">
        <option value="">All countries</option>
        <option v-for="o in filterOptions.country_options" :key="o.val" :value="o.val">{{ o.txt }}</option>
      </select>

      <select :value="modelValue.genre" @change="update('genre', $event.target.value)" aria-label="Filter by genre">
        <option value="">All genres</option>
        <option v-for="o in filterOptions.genre_options" :key="o.val" :value="o.val">{{ o.txt }}</option>
      </select>

      <select :value="modelValue.location" @change="update('location', $event.target.value)" aria-label="Filter by venue">
        <option value="">All venues</option>
        <option v-for="o in filterOptions.location_options" :key="o.val" :value="o.val">{{ o.txt }}</option>
      </select>

      <button v-if="hasActiveFilters" class="clear-btn" @click="clear">Clear</button>
    </div>
  `,
  cls,
};
