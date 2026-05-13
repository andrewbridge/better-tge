import { css } from "../deps/goober.mjs";
import { formatTime } from "../utilities/format.mjs";
import { venuePretty } from "../utilities/format.mjs";
import { gigStatus } from "../services/festival.mjs";

const cls = css`
  background: var(--paper);
  border: 2px solid var(--rule);
  box-shadow: 4px 4px 0 var(--rule);
  display: flex;
  flex-direction: column;
  cursor: pointer;
  transition: transform 0.08s, box-shadow 0.08s;
  position: relative;
  overflow: hidden;

  &:hover, &:focus-visible {
    transform: translate(-2px, -2px);
    box-shadow: 6px 6px 0 var(--rule);
    outline: none;
  }

  &:active { transform: none; box-shadow: 2px 2px 0 var(--rule); }

  &.shortlisted::after {
    content: '★';
    position: absolute;
    top: 0.3rem;
    right: 0.4rem;
    font-size: 0.9rem;
    color: var(--hot);
    line-height: 1;
  }

  .img-wrap {
    width: 100%;
    aspect-ratio: 4/3;
    overflow: hidden;
    background: var(--tint);
    flex-shrink: 0;

    img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
      filter: grayscale(20%);
    }

    .no-img {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: 'Bowlby One', sans-serif;
      font-size: 2.5rem;
      color: var(--muted);
    }
  }

  .info {
    padding: 0.6rem 0.7rem 0.7rem;
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }

  .name {
    font-family: 'Newsreader', serif;
    font-size: 1rem;
    font-weight: 700;
    line-height: 1.2;
    color: var(--ink);
    margin: 0;
  }

  .meta {
    font-family: 'Space Mono', monospace;
    font-size: 0.62rem;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .gigs {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    margin-top: 0.2rem;
  }

  .gig-row {
    font-family: 'Space Mono', monospace;
    font-size: 0.65rem;
    display: flex;
    gap: 0.4rem;
    align-items: center;

    .time { color: var(--ink); font-weight: bold; }
    .venue { color: var(--muted); }

    &.now .time { color: var(--hot); }
    &.soon .time { color: #c07000; }
  }
`;

export default {
  name: "ArtistCard",
  props: {
    artist: { type: Object, required: true },
    visibleGigs: { type: Array, default: () => [] },
    shortlisted: { type: Boolean, default: false },
    nowMs: { type: Number, required: true },
  },
  emits: ["open", "toggle-shortlist"],
  methods: {
    gigStatus(gig) {
      return gigStatus(gig.start, this.nowMs);
    },
    formatTime,
    venuePretty,
    handleKey(e) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        this.$emit("open", this.artist);
      }
    },
  },
  computed: {
    initials() {
      return this.artist.name
        .split(/\s+/)
        .slice(0, 2)
        .map((w) => w[0])
        .join("")
        .toUpperCase();
    },
  },
  template: `
    <article
      :class="[$options.cls, { shortlisted }]"
      tabindex="0"
      role="button"
      :aria-label="artist.name"
      @click="$emit('open', artist)"
      @keydown="handleKey"
    >
      <div class="img-wrap">
        <img v-if="artist.image" :src="artist.image" :alt="artist.name" loading="lazy" />
        <div v-else class="no-img">{{ initials }}</div>
      </div>
      <div class="info">
        <p class="name">{{ artist.name }}</p>
        <p class="meta">{{ artist.country }}</p>
        <div class="gigs">
          <div
            v-for="gig in visibleGigs"
            :key="gig.start"
            :class="['gig-row', gigStatus(gig)]"
          >
            <span class="time">{{ formatTime(gig.start) }}</span>
            <span class="venue">{{ venuePretty(gig.venue) }}</span>
          </div>
        </div>
      </div>
    </article>
  `,
  cls,
};
