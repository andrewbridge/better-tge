import { ref, computed, watch } from "../deps/vue.mjs";
import { persistRef } from "../deps/vue.mjs";
import { css, glob } from "../deps/goober.mjs";
import { applicationReady, applicationError, signalDOMReady } from "../services/data/lifecycle.mjs";
import { artists, filters as filterOptions } from "../services/data/festival-data.mjs";
import { shortlistSet, toggle as toggleShortlist } from "../services/shortlist.mjs";
import { matchesFilters, visibleGigsFor, sortArtistsAlpha } from "../services/filtering.mjs";
import { festivalDayFor, DAY_ORDER } from "../services/festival.mjs";
import Header from "./Header.mjs";
import ModeBar from "./ModeBar.mjs";
import ArtistGrid from "./ArtistGrid.mjs";
import ArtistModal from "./ArtistModal.mjs";

glob`
  *, *::before, *::after { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; height: 100%; }
  body {
    background: var(--paper);
    color: var(--ink);
    font-family: 'Newsreader', serif;
    -webkit-font-smoothing: antialiased;
  }
  #root {
    display: flex;
    flex-direction: column;
    height: 100dvh;
    min-height: 0;
  }
`;

const appCls = css`
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;

  .error-screen {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-direction: column;
    gap: 0.75rem;
    padding: 2rem;
    font-family: 'Space Mono', monospace;
    font-size: 0.8rem;
    color: var(--hot);
    text-align: center;
  }

  .count-bar {
    font-family: 'Space Mono', monospace;
    font-size: 0.6rem;
    color: var(--muted);
    padding: 0.25rem 1rem;
    border-bottom: 1px solid var(--tint);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
`;

export default {
  name: "App",
  components: { Header, ModeBar, ArtistGrid, ArtistModal },
  setup() {
    signalDOMReady();

    const nowMs = ref(Date.now());
    const timer = setInterval(() => { nowMs.value = Date.now(); }, 30_000);

    // Default to today's festival day, or Wednesday if outside festival
    const defaultDay = festivalDayFor(Date.now()) || DAY_ORDER[0];
    const mode = ref(defaultDay);
    persistRef(mode, "mode", false);

    const selectedArtist = ref(null);

    // The day to filter by: for day modes it's the mode itself, for shortlist show all days
    const activeDay = computed(() =>
      mode.value === "shortlist" ? "" : mode.value
    );

    const filteredArtists = computed(() => {
      const ms = nowMs.value;
      const effectiveFilters = { day: activeDay.value, country: "", genre: "", location: "" };
      const list = artists.value.filter((a) =>
        matchesFilters(a, effectiveFilters, shortlistSet.value, mode.value, ms)
      );
      return sortArtistsAlpha(list);
    });

    const getVisibleGigs = (artist) => {
      const effectiveFilters = { day: activeDay.value, country: "", genre: "", location: "" };
      return visibleGigsFor(artist, effectiveFilters, mode.value, nowMs.value);
    };

    return {
      applicationReady,
      applicationError,
      mode,
      filterOptions,
      nowMs,
      selectedArtist,
      filteredArtists,
      shortlistSet,
      getVisibleGigs,
      toggleShortlist,
      _timer: timer,
    };
  },
  beforeUnmount() {
    clearInterval(this._timer);
  },
  template: `
    <div :class="$options.appCls">
      <template v-if="applicationError">
        <Header />
        <div class="error-screen">
          <div>Failed to load line-up data.</div>
          <div>{{ applicationError?.message }}</div>
        </div>
      </template>

      <template v-else-if="!applicationReady">
        <!-- boot screen visible in index.html until ready -->
      </template>

      <template v-else>
        <Header />
        <ModeBar v-model="mode" />

        <div class="count-bar">{{ filteredArtists.length }} artists</div>

        <ArtistGrid
          :artists="filteredArtists"
          :get-visible-gigs="getVisibleGigs"
          :shortlist-set="shortlistSet"
          :now-ms="nowMs"
          :mode="mode"
          @open="selectedArtist = $event"
        />

        <ArtistModal
          :artist="selectedArtist"
          :shortlisted="selectedArtist ? shortlistSet.has(selectedArtist.slug) : false"
          :now-ms="nowMs"
          @close="selectedArtist = null"
          @toggle-shortlist="toggleShortlist"
        />
      </template>
    </div>
  `,
  appCls,
};
