import { css, glob } from "../deps/goober.mjs";
import { formatTime } from "../utilities/format.mjs";
import { venuePretty, servicePretty } from "../utilities/format.mjs";
import { gigStatus } from "../services/festival.mjs";
import { trapFocus } from "../utilities/focus-trap.mjs";

glob`
  body.modal-open { overflow: hidden; }
`;

const cls = css`
  position: fixed;
  inset: 0;
  z-index: 200;
  display: flex;
  align-items: flex-end;
  justify-content: center;

  @media (min-width: 600px) {
    align-items: center;
  }

  .backdrop {
    position: absolute;
    inset: 0;
    background: rgba(0,0,0,0.6);
    backdrop-filter: blur(2px);
  }

  .sheet {
    position: relative;
    background: var(--paper);
    border: 2px solid var(--rule);
    border-bottom: none;
    box-shadow: 0 -6px 0 var(--rule);
    width: 100%;
    max-width: 560px;
    max-height: 90dvh;
    display: flex;
    flex-direction: column;
    overflow: hidden;

    @media (min-width: 600px) {
      border-bottom: 2px solid var(--rule);
      box-shadow: 6px 6px 0 var(--rule);
      max-height: 85dvh;
    }
  }

  .hero {
    width: 100%;
    height: 180px;
    overflow: hidden;
    flex-shrink: 0;
    background: var(--tint);
    position: relative;

    img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      filter: grayscale(15%);
    }

    .no-img {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: 'Bowlby One', sans-serif;
      font-size: 4rem;
      color: var(--muted);
    }
  }

  .body {
    overflow-y: auto;
    padding: 1rem;
    flex: 1;
  }

  .top-row {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.5rem;
    margin-bottom: 0.75rem;
  }

  h2 {
    font-family: 'Newsreader', serif;
    font-size: 1.5rem;
    font-weight: 700;
    margin: 0;
    line-height: 1.2;
    color: var(--ink);
  }

  .star-btn {
    background: none;
    border: 2px solid var(--rule);
    box-shadow: 2px 2px 0 var(--rule);
    font-size: 1.1rem;
    width: 2.4rem;
    height: 2.4rem;
    cursor: pointer;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--muted);

    &.active { color: var(--hot); border-color: var(--hot); box-shadow: 2px 2px 0 var(--hot); }
    &:hover { background: var(--tint); }
  }

  .close-btn {
    position: absolute;
    top: 0.5rem;
    right: 0.5rem;
    background: var(--paper);
    border: 2px solid var(--rule);
    box-shadow: 2px 2px 0 var(--rule);
    width: 2rem;
    height: 2rem;
    cursor: pointer;
    font-size: 1rem;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10;

    &:hover { background: var(--hot); color: var(--paper); }
  }

  .meta {
    font-family: 'Space Mono', monospace;
    font-size: 0.65rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--muted);
    margin-bottom: 0.75rem;
  }

  .gigs {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    margin-bottom: 1rem;
  }

  .gig-row {
    font-family: 'Space Mono', monospace;
    font-size: 0.72rem;
    display: flex;
    gap: 0.5rem;
    align-items: center;
    padding: 0.3rem 0;
    border-bottom: 1px solid var(--tint);

    .time { font-weight: bold; color: var(--ink); min-width: 3rem; }
    .day { color: var(--muted); text-transform: capitalize; }
    .venue { color: var(--ink); }

    &.now .time { color: var(--hot); }
    &.soon .time { color: #c07000; }
  }

  .bio {
    font-family: 'Newsreader', serif;
    font-size: 0.95rem;
    line-height: 1.6;
    color: var(--ink);
    margin-bottom: 1rem;
  }

  .socials {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    margin-bottom: 1rem;

    a {
      font-family: 'Space Mono', monospace;
      font-size: 0.65rem;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--ink);
      border: 1.5px solid var(--rule);
      padding: 0.25rem 0.5rem;
      box-shadow: 2px 2px 0 var(--rule);
      text-decoration: none;

      &:hover { background: var(--ink); color: var(--paper); }
    }
  }

  .embeds {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;

    iframe {
      width: 100%;
      border: 2px solid var(--rule);
      box-shadow: 4px 4px 0 var(--rule);
    }
  }
`;

export default {
  name: "ArtistModal",
  props: {
    artist: { type: Object, default: null },
    shortlisted: { type: Boolean, default: false },
    nowMs: { type: Number, required: true },
  },
  emits: ["close", "toggle-shortlist"],
  watch: {
    artist(val) {
      if (val) {
        document.body.classList.add("modal-open");
        this.$nextTick(() => {
          const sheet = this.$refs.sheet;
          if (sheet) {
            if (this._releaseTrap) this._releaseTrap();
            this._releaseTrap = trapFocus(sheet);
          }
        });
      } else {
        document.body.classList.remove("modal-open");
        if (this._releaseTrap) { this._releaseTrap(); this._releaseTrap = null; }
      }
    },
  },
  methods: {
    gigStatus(gig) {
      return gigStatus(gig.start, this.nowMs);
    },
    formatTime,
    venuePretty,
    servicePretty,
    handleKey(e) {
      if (e.key === "Escape") this.$emit("close");
    },
  },
  computed: {
    initials() {
      if (!this.artist) return "";
      return this.artist.name
        .split(/\s+/)
        .slice(0, 2)
        .map((w) => w[0])
        .join("")
        .toUpperCase();
    },
  },
  mounted() {
    document.addEventListener("keydown", this.handleKey);
  },
  beforeUnmount() {
    document.removeEventListener("keydown", this.handleKey);
    document.body.classList.remove("modal-open");
    if (this._releaseTrap) this._releaseTrap();
  },
  template: `
    <teleport to="#teleport-root">
      <div v-if="artist" :class="$options.cls" role="dialog" :aria-label="artist.name" aria-modal="true">
        <div class="backdrop" @click="$emit('close')"></div>
        <div class="sheet" ref="sheet">
          <button class="close-btn" @click="$emit('close')" aria-label="Close">✕</button>

          <div class="hero">
            <img v-if="artist.image" :src="artist.image" :alt="artist.name" />
            <div v-else class="no-img">{{ initials }}</div>
          </div>

          <div class="body">
            <div class="top-row">
              <h2>{{ artist.name }}</h2>
              <button
                :class="['star-btn', { active: shortlisted }]"
                @click="$emit('toggle-shortlist', artist.slug)"
                :aria-label="shortlisted ? 'Remove from shortlist' : 'Add to shortlist'"
              >★</button>
            </div>

            <p class="meta">{{ artist.country }}<template v-if="artist.genres.length"> · {{ artist.genres.join(', ') }}</template></p>

            <div class="gigs">
              <div
                v-for="gig in artist.gigs"
                :key="gig.start"
                :class="['gig-row', gigStatus(gig)]"
              >
                <span class="time">{{ formatTime(gig.start) }}</span>
                <span class="day">{{ gig.day }}</span>
                <span class="venue">{{ venuePretty(gig.venue) }}</span>
              </div>
            </div>

            <p v-if="artist.bio" class="bio">{{ artist.bio }}</p>

            <div v-if="artist.socials.length" class="socials">
              <a
                v-for="s in artist.socials"
                :key="s.url"
                :href="s.url"
                target="_blank"
                rel="noopener noreferrer"
              >{{ servicePretty(s.service) }}</a>
            </div>

            <div v-if="artist.embeds.length" class="embeds">
              <iframe
                v-for="e in artist.embeds"
                :key="e.src"
                :src="e.src"
                :title="e.title || artist.name"
                :height="e.type === 'spotify' ? 152 : 220"
                frameborder="0"
                allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                loading="lazy"
              ></iframe>
            </div>
          </div>
        </div>
      </div>
    </teleport>
  `,
  cls,
};
