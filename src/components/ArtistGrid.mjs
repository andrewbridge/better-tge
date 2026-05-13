import { css } from "../deps/goober.mjs";
import ArtistCard from "./ArtistCard.mjs";
import { formatHourLabel } from "../utilities/format.mjs";
import { groupGigsByHour } from "../services/filtering.mjs";

const cls = css`
  flex: 1;
  overflow-y: auto;
  padding: 0.75rem 1rem 2rem;

  .empty {
    font-family: 'Space Mono', monospace;
    font-size: 0.8rem;
    color: var(--muted);
    text-align: center;
    padding: 3rem 1rem;
  }

  .hour-group {
    margin-bottom: 1.5rem;
  }

  .hour-label {
    font-family: 'Bowlby One', sans-serif;
    font-size: 1.6rem;
    color: var(--ink);
    line-height: 1;
    padding: 0.15rem 0 0.4rem;
    border-bottom: 3px solid var(--hot);
    margin-bottom: 0.6rem;
    display: flex;
    align-items: baseline;
    gap: 0.6rem;

    .now-badge {
      font-family: 'Space Mono', monospace;
      font-size: 0.6rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--paper);
      background: var(--hot);
      padding: 0.15rem 0.4rem;
      vertical-align: middle;
    }
  }

  .cards {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
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
  emits: ["open"],
  computed: {
    isEmpty() { return this.artists.length === 0; },
    hourGroups() {
      const withGigs = this.artists.map((a) => ({
        artist: a,
        gigs: this.getVisibleGigs(a),
      })).filter((x) => x.gigs.length > 0);
      return groupGigsByHour(withGigs);
    },
  },
  methods: {
    formatHourLabel,
    isNowHour(ms) {
      return this.nowMs >= ms && this.nowMs < ms + 60 * 60_000;
    },
  },
  template: `
    <section :class="$options.cls">
      <div v-if="isEmpty" class="empty">
        {{ mode === 'shortlist' ? 'No artists shortlisted yet — tap ★ on any artist.' : 'No artists match.' }}
      </div>

      <div v-else>
        <div v-for="group in hourGroups" :key="group.ms" class="hour-group">
          <div class="hour-label">
            {{ formatHourLabel(group.ms) }}
            <span v-if="isNowHour(group.ms)" class="now-badge">now</span>
          </div>
          <div class="cards">
            <ArtistCard
              v-for="{ artist, gig } in group.entries"
              :key="artist.slug + gig.start"
              :artist="artist"
              :visible-gigs="[gig]"
              :shortlisted="shortlistSet.has(artist.slug)"
              :now-ms="nowMs"
              @open="$emit('open', $event)"
            />
          </div>
        </div>
      </div>
    </section>
  `,
  cls,
};
