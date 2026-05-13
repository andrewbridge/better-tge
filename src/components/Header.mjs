import { css } from "../deps/goober.mjs";
import { FESTIVAL_NAME } from "../services/festival.mjs";

const cls = css`
  background: var(--ink);
  color: var(--paper);
  padding: 0.6rem 0.75rem;
  display: flex;
  align-items: center;
  border-bottom: 3px solid var(--hot);
  gap: 0.5rem;
  flex-shrink: 0;

  .title-group {
    flex: 1;
    display: flex;
    align-items: baseline;
    gap: 0.6rem;
    min-width: 0;
  }

  h1 {
    font-family: 'Bowlby One', sans-serif;
    font-size: clamp(1rem, 4vw, 1.4rem);
    letter-spacing: 0.02em;
    margin: 0;
    line-height: 1;
    color: var(--hot);
    white-space: nowrap;
  }

  .sub {
    font-family: 'Space Mono', monospace;
    font-size: 0.6rem;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .actions {
    display: flex;
    gap: 0.35rem;
    flex-shrink: 0;
  }

  .icon-btn {
    background: none;
    border: 1.5px solid #444;
    color: #aaa;
    font-size: 0.8rem;
    width: 2rem;
    height: 2rem;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    flex-shrink: 0;
    transition: color 0.1s, border-color 0.1s;

    &:hover { color: var(--paper); border-color: var(--paper); }
    &:focus { outline: 2px solid var(--hot); outline-offset: 2px; }
    &.active { color: var(--hot); border-color: var(--hot); }
  }
`;

export default {
  name: "AppHeader",
  props: {
    recommendActive: { type: Boolean, default: false },
  },
  emits: ["open-settings", "open-recommend"],
  template: `
    <header :class="$options.cls">
      <div class="title-group">
        <h1>better-tge</h1>
        <span class="sub">{{ name }}</span>
      </div>
      <div class="actions">
        <button
          class="icon-btn"
          :class="{ active: recommendActive }"
          @click="$emit('open-recommend')"
          aria-label="AI recommendations"
          title="AI recommendations"
        >✦</button>
        <button
          class="icon-btn"
          @click="$emit('open-settings')"
          aria-label="Settings"
          title="Settings"
        >⚙</button>
      </div>
    </header>
  `,
  cls,
  data() {
    return { name: FESTIVAL_NAME };
  },
};
