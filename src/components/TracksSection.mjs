import { ref, computed } from "../deps/vue.mjs";
import { css } from "../deps/goober.mjs";
import ArtistCard from "./ArtistCard.mjs";
import { groupGigsByHour } from "../services/filtering.mjs";
import { formatHourLabel } from "../utilities/format.mjs";

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

  .card-timetable {
    border-top: 2px solid var(--rule);
    padding: 0.75rem 1rem;
    background: var(--tint);
    display: flex;
    flex-direction: column;
    gap: 0.75rem;

    .hour-group {
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
    }

    .hour-label {
      font-family: 'Bowlby One', sans-serif;
      font-size: 1.1rem;
      color: var(--ink);
      line-height: 1;
      padding-bottom: 0.25rem;
      border-bottom: 2px solid var(--hot);
      margin-bottom: 0.2rem;
    }

    .cards {
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
    }
  }
`;

const TrackCard = {
  name: "TrackCard",
  components: { ArtistCard },
  props: {
    track: { type: Object, required: true },
    artists: { type: Array, required: true },
    nowMs: { type: Number, required: true },
    shortlistSet: { type: Object, required: true },
  },
  emits: ["open-artist"],
  setup(props) {
    const expanded = ref(false);

    const trackArtists = computed(() =>
      props.track.slugs
        .map((slug) => props.artists.find((a) => a.slug === slug))
        .filter(Boolean)
    );

    const hourGroups = computed(() => {
      if (!expanded.value) return [];
      const withGigs = trackArtists.value.map((a) => ({ artist: a, gigs: a.gigs }));
      return groupGigsByHour(withGigs);
    });

    function toggle() {
      expanded.value = !expanded.value;
    }

    return { expanded, trackArtists, hourGroups, toggle, formatHourLabel };
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
      <div v-if="expanded" class="card-timetable">
        <template v-if="hourGroups.length">
          <div v-for="group in hourGroups" :key="group.ms" class="hour-group">
            <div class="hour-label">{{ formatHourLabel(group.ms) }}</div>
            <div class="cards">
              <ArtistCard
                v-for="{ artist, gig } in group.entries"
                :key="artist.slug + gig.start"
                :artist="artist"
                :visible-gigs="[gig]"
                :shortlisted="shortlistSet.has(artist.slug)"
                :now-ms="nowMs"
                @open="$emit('open-artist', $event)"
              />
            </div>
          </div>
        </template>
        <template v-else>
          <ArtistCard
            v-for="artist in trackArtists"
            :key="artist.slug"
            :artist="artist"
            :visible-gigs="artist.gigs"
            :shortlisted="shortlistSet.has(artist.slug)"
            :now-ms="nowMs"
            @open="$emit('open-artist', $event)"
          />
        </template>
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
    nowMs: { type: Number, required: true },
    shortlistSet: { type: Object, required: true },
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
          :now-ms="nowMs"
          :shortlist-set="shortlistSet"
          @open-artist="$emit('open-artist', $event)"
        />
      </template>
    </div>
  `,
  sectionCls,
};
