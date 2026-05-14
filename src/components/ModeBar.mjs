import { css } from "../deps/goober.mjs";
import { DAY_ORDER } from "../services/festival.mjs";

const DAY_LABELS = {
  wednesday: "Wed",
  thursday: "Thu",
  friday: "Fri",
  saturday: "Sat",
};

const cls = css`
  display: flex;
  overflow-x: auto;
  scrollbar-width: none;
  background: var(--ink);
  border-bottom: 2px solid var(--rule);
  gap: 0;

  &::-webkit-scrollbar { display: none; }

  button {
    flex: 1 0 auto;
    font-family: 'Space Mono', monospace;
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    padding: 0.65rem 0.75rem;
    background: none;
    border: none;
    border-right: 1px solid #333;
    color: #aaa;
    cursor: pointer;
    white-space: nowrap;

    &:last-child { border-right: none; }
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
  data() {
    return {
      modes: [
        ...DAY_ORDER.map((d) => ({ id: d, label: DAY_LABELS[d] })),
        { id: "shortlist", label: "★ List" },
        { id: "tracks", label: "✦ Tracks" },
      ],
    };
  },
  template: `
    <nav :class="$options.cls" role="tablist" aria-label="Day">
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
};
