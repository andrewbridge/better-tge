import { css } from "../deps/goober.mjs";
import { FESTIVAL_NAME } from "../services/festival.mjs";

const cls = css`
  background: var(--ink);
  color: var(--paper);
  padding: 0.75rem 1rem;
  display: flex;
  align-items: baseline;
  gap: 0.75rem;
  border-bottom: 3px solid var(--hot);

  h1 {
    font-family: 'Bowlby One', sans-serif;
    font-size: clamp(1.1rem, 4vw, 1.6rem);
    letter-spacing: 0.02em;
    margin: 0;
    line-height: 1;
    color: var(--hot);
  }

  .sub {
    font-family: 'Space Mono', monospace;
    font-size: 0.65rem;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }
`;

export default {
  name: "AppHeader",
  template: `
    <header :class="$options.cls">
      <h1>better-tge</h1>
      <span class="sub">{{ name }}</span>
    </header>
  `,
  cls,
  data() {
    return { name: FESTIVAL_NAME };
  },
};
