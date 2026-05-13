import { css } from "../deps/goober.mjs";

const MODES = [
  { id: "now", label: "On Now" },
  { id: "soon", label: "Up Soon" },
  { id: "today", label: "Today" },
  { id: "all", label: "All" },
  { id: "shortlist", label: "Shortlist" },
];

const cls = css`
  display: flex;
  overflow-x: auto;
  scrollbar-width: none;
  background: var(--ink);
  border-bottom: 2px solid var(--rule);
  gap: 0;

  &::-webkit-scrollbar { display: none; }

  button {
    flex: 0 0 auto;
    font-family: 'Space Mono', monospace;
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    padding: 0.6rem 1.1rem;
    background: none;
    border: none;
    border-right: 1px solid #333;
    color: #aaa;
    cursor: pointer;
    transition: color 0.1s, background 0.1s;
    white-space: nowrap;

    &:hover { color: var(--paper); }
    &.active {
      color: var(--ink);
      background: var(--hot);
    }
  }
`;

export default {
  name: "ModeBar",
  props: {
    modelValue: { type: String, required: true },
  },
  emits: ["update:modelValue"],
  template: `
    <nav :class="$options.cls" role="tablist" aria-label="Browse mode">
      <button
        v-for="m in modes"
        :key="m.id"
        role="tab"
        :aria-selected="modelValue === m.id"
        :class="{ active: modelValue === m.id }"
        @click="$emit('update:modelValue', m.id)"
      >{{ m.label }}</button>
    </nav>
  `,
  cls,
  data() {
    return { modes: MODES };
  },
};
