import { ref, computed, watch } from "../deps/vue.mjs";
import { persistRef } from "../deps/vue.mjs";
import { css, glob } from "../deps/goober.mjs";
import { applicationReady, applicationError, signalDOMReady } from "../services/data/lifecycle.mjs";
import { artists, venues, distances, filters as filterOptions } from "../services/data/festival-data.mjs";
import { shortlistSet, toggle as toggleShortlist } from "../services/shortlist.mjs";
import { matchesFilters, visibleGigsFor, sortArtistsAlpha, festivalDayOf } from "../services/filtering.mjs";
import { festivalDayFor, DAY_ORDER } from "../services/festival.mjs";
import { venuePretty } from "../utilities/format.mjs";
import Header from "./Header.mjs";
import ModeBar from "./ModeBar.mjs";
import VenueBar from "./VenueBar.mjs";
import ArtistGrid from "./ArtistGrid.mjs";
import ArtistModal from "./ArtistModal.mjs";
import SettingsModal from "./SettingsModal.mjs";
import RecommendPanel from "./RecommendPanel.mjs";

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
  components: { Header, ModeBar, VenueBar, ArtistGrid, ArtistModal, SettingsModal, RecommendPanel },
  setup() {
    signalDOMReady();

    const nowMs = ref(Date.now());
    const timer = setInterval(() => { nowMs.value = Date.now(); }, 30_000);

    const defaultDay = festivalDayFor(Date.now()) || DAY_ORDER[0];
    const mode = ref(defaultDay);
    persistRef(mode, "mode", false);
    const validModes = new Set([...DAY_ORDER, "shortlist"]);
    if (!validModes.has(mode.value)) mode.value = defaultDay;

    const selectedVenue = ref("");
    const selectedArtist = ref(null);
    const showSettings = ref(false);
    const showRecommend = ref(false);

    watch(mode, () => { selectedVenue.value = ""; });

    const activeDay = computed(() =>
      mode.value === "shortlist" ? "" : mode.value
    );

    const venueOptions = computed(() => {
      if (!activeDay.value) return [];
      const seen = new Map();
      for (const artist of artists.value) {
        for (const gig of artist.gigs) {
          if (festivalDayOf(gig) === activeDay.value && !seen.has(gig.venue)) {
            seen.set(gig.venue, gig.venue_name || venuePretty(gig.venue));
          }
        }
      }
      return [...seen.entries()]
        .map(([slug, name]) => ({ slug, name }))
        .sort((a, b) => a.name.localeCompare(b.name));
    });

    const filteredArtists = computed(() => {
      const ms = nowMs.value;
      const effectiveFilters = { day: activeDay.value, country: "", genre: "", location: selectedVenue.value };
      const list = artists.value.filter((a) =>
        matchesFilters(a, effectiveFilters, shortlistSet.value, mode.value, ms)
      );
      return sortArtistsAlpha(list);
    });

    const getVisibleGigs = (artist) => {
      const effectiveFilters = { day: activeDay.value, country: "", genre: "", location: selectedVenue.value };
      return visibleGigsFor(artist, effectiveFilters, mode.value, nowMs.value);
    };

    return {
      applicationReady,
      applicationError,
      mode,
      selectedVenue,
      venueOptions,
      nowMs,
      selectedArtist,
      showSettings,
      showRecommend,
      filteredArtists,
      shortlistSet,
      getVisibleGigs,
      toggleShortlist,
      artists,
      venues,
      distances,
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
        <Header
          :recommend-active="showRecommend"
          @open-settings="showSettings = true"
          @open-recommend="showRecommend = !showRecommend"
        />
        <ModeBar v-model="mode" />
        <VenueBar v-model="selectedVenue" :venues="venueOptions" />

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

        <SettingsModal
          v-if="showSettings"
          @close="showSettings = false"
        />

        <RecommendPanel
          v-if="showRecommend"
          :artists="artists"
          :venues="venues"
          :distances="distances"
          @close="showRecommend = false"
          @open-artist="selectedArtist = $event"
        />
      </template>
    </div>
  `,
  appCls,
};
