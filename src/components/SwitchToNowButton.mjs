import { css } from "../deps/goober.mjs";

const cls = css`
  position: fixed;
  left: 50%;
  transform: translateX(-50%);
  bottom: calc(1rem + env(safe-area-inset-bottom, 0px));
  z-index: 150;

  background: var(--hot);
  color: var(--paper);
  border: none;
  border-radius: 999px;
  font-family: 'Space Mono', monospace;
  font-size: 0.65rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  padding: 0.5rem 1rem;
  cursor: pointer;
  white-space: nowrap;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);

  transition: opacity 0.15s, transform 0.15s;
  &:hover { opacity: 0.85; }
  &:active { transform: translateX(-50%) scale(0.96); }
  &:focus { outline: 2px solid var(--paper); outline-offset: 2px; }
`;

export default {
  name: "SwitchToNowButton",
  emits: ["click"],
  template: `
    <button :class="$options.cls" aria-label="Jump to now" @click="$emit('click')">
      ● jump to now
    </button>
  `,
  cls,
};
