import { css } from "../deps/goober.mjs";
import { formatTime } from "../utilities/format.mjs";
import { venuePretty } from "../utilities/format.mjs";
import { gigStatus } from "../services/festival.mjs";

const cls = css`
  background: var(--paper);
  border: 2px solid var(--rule);
  box-shadow: 3px 3px 0 var(--rule);
  display: flex;
  flex-direction: row;
  cursor: pointer;
  transition: transform 0.08s, box-shadow 0.08s;
  position: relative;
  overflow: hidden;
  gap: 0;
  min-height: 4.5rem;

  &:hover, &:focus-visible {
    transform: translate(-2px, -2px);
    box-shadow: 5px 5px 0 var(--rule);
    outline: none;
  }

  &:active { transform: none; box-shadow: 1px 1px 0 var(--rule); }

  &.shortlisted .name::after {
    content: ' ★';
    color: var(--hot);
    font-size: 0.8em;
  }

  .thumb {
    width: 4.5rem;
    min-width: 4.5rem;
    overflow: hidden;
    background: var(--tint);
    flex-shrink: 0;
    align-self: stretch;

    img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
      filter: grayscale(25%);
    }

    .no-img {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: 'Bowlby One', sans-serif;
      font-size: 1.3rem;
      color: var(--muted);
    }
  }

  .info {
    padding: 0.5rem 0.6rem;
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 0.15rem;
    min-width: 0;
  }

  .name {
    font-family: 'Newsreader', serif;
    font-size: 0.95rem;
    font-weight: 700;
    line-height: 1.2;
    color: var(--ink);
    margin: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .genre {
    font-family: 'Space Mono', monospace;
    font-size: 0.62rem;
    color: var(--hot);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .gig-row {
    font-family: 'Space Mono', monospace;
    font-size: 0.62rem;
    display: flex;
    gap: 0.35rem;
    align-items: center;
    color: var(--muted);
    margin-top: 0.1rem;

    .venue { color: var(--muted); }

    &.now { .venue { color: var(--ink); font-weight: bold; } }
  }

  .status-pip {
    width: 0.45rem;
    height: 0.45rem;
    border-radius: 50%;
    flex-shrink: 0;
    background: transparent;

    &.now { background: var(--hot); }
    &.soon { background: #c07000; }
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
  emits: ["open"],
  methods: {
    gigStatus(gig) { return gigStatus(gig.start, this.nowMs); },
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
    genreLabel() {
      return this.artist.genres.slice(0, 2).join(" / ") || "";
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
      <div class="thumb">
        <img v-if="artist.image" :src="artist.image" :alt="artist.name" loading="lazy" />
        <div v-else class="no-img">{{ initials }}</div>
      </div>
      <div class="info">
        <p class="name">{{ artist.name }}</p>
        <p v-if="genreLabel" class="genre">{{ genreLabel }}</p>
        <div
          v-for="gig in visibleGigs"
          :key="gig.start"
          :class="['gig-row', gigStatus(gig)]"
        >
          <span :class="['status-pip', gigStatus(gig)]"></span>
          <span class="venue">{{ venuePretty(gig.venue) }}</span>
          <span>{{ formatTime(gig.start) }}</span>
        </div>
      </div>
    </article>
  `,
  cls,
};
