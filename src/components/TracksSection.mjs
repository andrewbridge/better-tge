import { ref } from "../deps/vue.mjs";
import { css } from "../deps/goober.mjs";
import { toggle as toggleShortlist, has as inShortlist } from "../services/shortlist.mjs";

const sectionCls = css`
  flex: 1;
  overflow-y: auto;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;

  .empty {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 2rem;
    text-align: center;
    font-family: 'Space Mono', monospace;
    font-size: 0.7rem;
    color: var(--muted);
    strong { color: var(--ink); display: block; margin-bottom: 0.25rem; font-size: 0.8rem; }
    code { font-size: 0.65rem; background: var(--tint); padding: 0.1rem 0.3rem; }
  }
`;

const cardCls = css`
  border: 2px solid var(--rule);
  box-shadow: 4px 4px 0 var(--rule);

  .card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem 1rem;
    cursor: pointer;
    background: var(--paper);
    gap: 0.75rem;

    &:hover { background: var(--tint); }

    .card-title {
      font-family: 'Bowlby One', sans-serif;
      font-size: 0.95rem;
      color: var(--hot);
      margin: 0;
    }

    .card-meta {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      flex-shrink: 0;

      .count {
        font-family: 'Space Mono', monospace;
        font-size: 0.6rem;
        color: var(--muted);
        white-space: nowrap;
      }

      .chevron {
        font-size: 0.7rem;
        color: var(--muted);
        transition: transform 0.15s;
        &.open { transform: rotate(90deg); }
      }
    }
  }

  .card-desc {
    padding: 0 1rem 0.6rem;
    background: var(--paper);
    font-family: 'Space Mono', monospace;
    font-size: 0.65rem;
    color: var(--muted);
    line-height: 1.55;
    border-top: 1px solid var(--tint);
  }

  .card-artists {
    border-top: 2px solid var(--rule);
    padding: 0.75rem 1rem;
    background: var(--tint);
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }
`;

const chipCls = css`
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-family: 'Space Mono', monospace;
  font-size: 0.62rem;
  border: 1.5px solid var(--rule);
  padding: 0.2rem 0.5rem;
  background: var(--paper);
  cursor: pointer;
  white-space: nowrap;
  box-shadow: 2px 2px 0 var(--rule);

  &:hover { background: var(--tint); }
  &.starred { border-color: var(--hot); box-shadow: 2px 2px 0 var(--hot); }

  .star { color: var(--hot); }
`;

const ArtistChip = {
  name: "ArtistChip",
  props: { artist: { type: Object, required: true } },
  emits: ["open"],
  data() {
    return { starred: inShortlist(this.artist.slug) };
  },
  methods: {
    toggle() {
      toggleShortlist(this.artist.slug);
      this.starred = inShortlist(this.artist.slug);
    },
  },
  template: `
    <span :class="[$options.chipCls, { starred }]">
      <span @click="$emit('open', artist)" style="flex:1">{{ artist.name }}</span>
      <button
        @click.stop="toggle"
        :aria-label="starred ? 'Remove from shortlist' : 'Add to shortlist'"
        style="background:none;border:none;padding:0;cursor:pointer;line-height:1"
      ><span class="star">{{ starred ? '★' : '☆' }}</span></button>
    </span>
  `,
  chipCls,
};

const TrackCard = {
  name: "TrackCard",
  components: { ArtistChip },
  props: {
    track: { type: Object, required: true },
    artists: { type: Array, required: true },
  },
  emits: ["open-artist"],
  setup(props) {
    const expanded = ref(false);

    const trackArtists = () =>
      props.track.slugs
        .map((slug) => props.artists.find((a) => a.slug === slug))
        .filter(Boolean);

    function toggle() {
      expanded.value = !expanded.value;
    }

    return { expanded, trackArtists, toggle };
  },
  template: `
    <div :class="$options.cardCls">
      <div class="card-header" @click="toggle" role="button" :aria-expanded="expanded">
        <h3 class="card-title">{{ track.name }}</h3>
        <div class="card-meta">
          <span class="count">{{ track.slugs.length }} artists</span>
          <span :class="['chevron', { open: expanded }]">▶</span>
        </div>
      </div>
      <div class="card-desc">{{ track.description }}</div>
      <div v-if="expanded" class="card-artists">
        <ArtistChip
          v-for="a in trackArtists()"
          :key="a.slug"
          :artist="a"
          @open="$emit('open-artist', $event)"
        />
      </div>
    </div>
  `,
  cardCls,
};

export default {
  name: "TracksSection",
  components: { TrackCard },
  props: {
    tracks: { type: Array, required: true },
    artists: { type: Array, required: true },
  },
  emits: ["open-artist"],
  template: `
    <div :class="$options.sectionCls">
      <div v-if="!tracks.length" class="empty">
        <div>
          <strong>No tracks available</strong>
          Re-run the build with <code>OPENROUTER_API_KEY</code> set to generate thematic artist collections.
        </div>
      </div>
      <template v-else>
        <TrackCard
          v-for="track in tracks"
          :key="track.id"
          :track="track"
          :artists="artists"
          @open-artist="$emit('open-artist', $event)"
        />
      </template>
    </div>
  `,
  sectionCls,
};
