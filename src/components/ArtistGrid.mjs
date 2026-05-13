import { css } from "../deps/goober.mjs";
import ArtistCard from "./ArtistCard.mjs";
import { formatHourLabel } from "../utilities/format.mjs";
import { groupGigsByHour } from "../services/filtering.mjs";

const cls = css`
  flex: 1;
  overflow-y: auto;
  padding: 1rem;

  .empty {
    font-family: 'Space Mono', monospace;
    font-size: 0.8rem;
    color: var(--muted);
    text-align: center;
    padding: 3rem 1rem;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
    gap: 1rem;
  }

  .hour-group {
    margin-bottom: 2rem;

    h2 {
      font-family: 'Bowlby One', sans-serif;
      font-size: 1.4rem;
      color: var(--ink);
      border-bottom: 3px solid var(--hot);
      padding-bottom: 0.2rem;
      margin: 0 0 0.75rem;
      display: inline-block;
    }
  }
`;

export default {
  name: "ArtistGrid",
  components: { ArtistCard },
  props: {
    artists: { type: Array, required: true },
    getVisibleGigs: { type: Function, required: true },
    shortlistSet: { type: Object, required: true },
    nowMs: { type: Number, required: true },
    mode: { type: String, required: true },
  },
  emits: ["open", "toggle-shortlist"],
  computed: {
    isEmpty() {
      return this.artists.length === 0;
    },
    isTimeGrouped() {
      return this.mode === "now" || this.mode === "soon";
    },
    hourGroups() {
      const withGigs = this.artists.map((a) => ({
        artist: a,
        gigs: this.getVisibleGigs(a),
      }));
      return groupGigsByHour(withGigs);
    },
  },
  methods: {
    formatHourLabel,
  },
  template: `
    <section :class="$options.cls">
      <div v-if="isEmpty" class="empty">No artists match — try adjusting the filters.</div>

      <!-- Time-grouped view for now/soon modes -->
      <div v-else-if="isTimeGrouped">
        <div v-for="group in hourGroups" :key="group.ms" class="hour-group">
          <h2>{{ formatHourLabel(group.ms) }}</h2>
          <div class="grid">
            <ArtistCard
              v-for="{ artist, gig } in group.entries"
              :key="artist.slug + gig.start"
              :artist="artist"
              :visible-gigs="[gig]"
              :shortlisted="shortlistSet.has(artist.slug)"
              :now-ms="nowMs"
              @open="$emit('open', $event)"
              @toggle-shortlist="$emit('toggle-shortlist', $event)"
            />
          </div>
        </div>
      </div>

      <!-- Flat alpha grid for all other modes -->
      <div v-else class="grid">
        <ArtistCard
          v-for="artist in artists"
          :key="artist.slug"
          :artist="artist"
          :visible-gigs="getVisibleGigs(artist)"
          :shortlisted="shortlistSet.has(artist.slug)"
          :now-ms="nowMs"
          @open="$emit('open', $event)"
          @toggle-shortlist="$emit('toggle-shortlist', $event)"
        />
      </div>
    </section>
  `,
  cls,
};
