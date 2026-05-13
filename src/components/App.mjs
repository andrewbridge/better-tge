import { ref, computed, watch } from "../deps/vue.mjs";
import { persistRef } from "../deps/vue.mjs";
import { css, glob } from "../deps/goober.mjs";
import { applicationReady, applicationError } from "../services/data/lifecycle.mjs";
import { signalDOMReady } from "../services/data/lifecycle.mjs";
import { artists, filters as filterOptions } from "../services/data/festival-data.mjs";
import { shortlistSet, toggle as toggleShortlist } from "../services/shortlist.mjs";
import { matchesFilters, visibleGigsFor, sortArtistsAlpha } from "../services/filtering.mjs";
import { festivalDayFor, isDuringFestival } from "../services/festival.mjs";
import Header from "./Header.mjs";
import ModeBar from "./ModeBar.mjs";
import FilterBar from "./Filters.mjs";
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
    font-size: 0.62rem;
    color: var(--muted);
    padding: 0.3rem 1rem;
    background: var(--tint);
    border-bottom: 1px solid var(--rule);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
`;

export default {
  name: "App",
  components: { Header, ModeBar, FilterBar, ArtistGrid, ArtistModal },
  setup() {
    // Signal DOM ready after first render
    signalDOMReady();

    const mode = ref("today");
    persistRef(mode, "mode", false);

    const activeFilters = ref({ day: "", country: "", genre: "", location: "" });
    persistRef(activeFilters, "filters", false);

    const nowMs = ref(Date.now());
    const timer = setInterval(() => { nowMs.value = Date.now(); }, 30_000);

    const selectedArtist = ref(null);

    // Auto-set mode based on festival timing
    watch(nowMs, (ms) => {
      if (!isDuringFestival(ms) && mode.value === "now") {
        mode.value = "today";
      }
    }, { immediate: true });

    // When mode changes to today/now/soon, clear day filter (implicit)
    watch(mode, (m) => {
      if (["today", "now", "soon"].includes(m)) {
        activeFilters.value = { ...activeFilters.value, day: "" };
      }
    });

    const todayKey = computed(() => festivalDayFor(nowMs.value));

    const filteredArtists = computed(() => {
      const ms = nowMs.value;
      const day = mode.value === "today" || mode.value === "now" || mode.value === "soon"
        ? todayKey.value
        : activeFilters.value.day;
      const effectiveFilters = { ...activeFilters.value, day: day || activeFilters.value.day };

      const list = artists.value.filter((a) =>
        matchesFilters(a, effectiveFilters, shortlistSet.value, mode.value, ms)
      );
      return sortArtistsAlpha(list);
    });

    const getVisibleGigs = (artist) => {
      const ms = nowMs.value;
      const day = mode.value === "today" || mode.value === "now" || mode.value === "soon"
        ? todayKey.value
        : activeFilters.value.day;
      const effectiveFilters = { ...activeFilters.value, day: day || activeFilters.value.day };
      return visibleGigsFor(artist, effectiveFilters, mode.value, ms);
    };

    // Cleanup on unmount not easy in setup without onUnmounted import — add it
    return {
      applicationReady,
      applicationError,
      mode,
      activeFilters,
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
        <!-- Boot screen handled by index.html; nothing to render here yet -->
      </template>

      <template v-else>
        <Header />
        <ModeBar v-model="mode" />
        <FilterBar v-model="activeFilters" :filter-options="filterOptions" :mode="mode" />

        <div class="count-bar">
          {{ filteredArtists.length }} artist{{ filteredArtists.length === 1 ? '' : 's' }}
        </div>

        <ArtistGrid
          :artists="filteredArtists"
          :get-visible-gigs="getVisibleGigs"
          :shortlist-set="shortlistSet"
          :now-ms="nowMs"
          :mode="mode"
          @open="selectedArtist = $event"
          @toggle-shortlist="toggleShortlist"
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
