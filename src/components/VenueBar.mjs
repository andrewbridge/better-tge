import { css } from "../deps/goober.mjs";

const cls = css`
  display: flex;
  overflow-x: auto;
  scrollbar-width: none;
  background: var(--tint);
  border-bottom: 2px solid var(--rule);
  gap: 0;

  &::-webkit-scrollbar { display: none; }

  button {
    flex: 0 0 auto;
    font-family: 'Space Mono', monospace;
    font-size: 0.65rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding: 0.45rem 0.85rem;
    background: none;
    border: none;
    border-right: 1px solid var(--rule);
    color: var(--muted);
    cursor: pointer;
    white-space: nowrap;

    &:last-child { border-right: none; }
    &:hover { color: var(--ink); }
    &.active {
      color: var(--paper);
      background: var(--ink);
    }
  }
`;

export default {
  name: "VenueBar",
  props: {
    venues: { type: Array, required: true },   // [{ slug, name }]
    modelValue: { type: String, default: "" }, // selected venue slug or ""
  },
  emits: ["update:modelValue"],
  methods: {
    select(slug) {
      // Toggle: clicking active venue clears it
      this.$emit("update:modelValue", this.modelValue === slug ? "" : slug);
    },
  },
  template: `
    <nav v-if="venues.length > 1" :class="$options.cls" role="tablist" aria-label="Venue">
      <button
        v-for="v in venues"
        :key="v.slug"
        role="tab"
        :aria-selected="modelValue === v.slug"
        :class="{ active: modelValue === v.slug }"
        @click="select(v.slug)"
      >{{ v.name }}</button>
    </nav>
  `,
  cls,
};
