import { ref, computed, nextTick } from "../deps/vue.mjs";
import { css, glob } from "../deps/goober.mjs";
import { apiKey, model } from "../services/settings.mjs";
import { buildSystemPrompt, streamCompletion, parseAIResponse, upcomingArtists } from "../services/ai.mjs";
import { toggle as toggleShortlist, has as inShortlist } from "../services/shortlist.mjs";
import { trapFocus } from "../utilities/focus-trap.mjs";
import { festivalDayFor } from "../services/festival.mjs";

glob`body.recommend-open { overflow: hidden; }`;

const panelCls = css`
  position: fixed;
  inset: 0;
  z-index: 250;
  display: flex;
  align-items: flex-end;
  justify-content: center;

  @media (min-width: 600px) { align-items: center; }

  .backdrop {
    position: absolute;
    inset: 0;
    background: rgba(0,0,0,0.55);
  }

  .sheet {
    position: relative;
    background: var(--paper);
    border: 2px solid var(--rule);
    border-bottom: none;
    box-shadow: 0 -4px 0 var(--rule);
    width: 100%;
    max-width: 560px;
    max-height: 88dvh;
    display: flex;
    flex-direction: column;

    @media (min-width: 600px) {
      border-bottom: 2px solid var(--rule);
      box-shadow: 6px 6px 0 var(--rule);
      max-height: 85dvh;
    }
  }

  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem 1rem;
    border-bottom: 2px solid var(--rule);
    flex-shrink: 0;

    h2 {
      font-family: 'Bowlby One', sans-serif;
      font-size: 1rem;
      margin: 0;
      color: var(--hot);
    }

    button {
      background: none;
      border: none;
      font-size: 1rem;
      cursor: pointer;
      color: var(--muted);
      padding: 0.2rem;
      &:hover { color: var(--ink); }
      &:focus { outline: 2px solid var(--hot); }
    }
  }

  .no-key {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    padding: 2rem;
    text-align: center;
    font-family: 'Space Mono', monospace;
    font-size: 0.75rem;
    color: var(--muted);

    strong { color: var(--ink); display: block; margin-bottom: 0.25rem; }
  }

  .mode-select {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1rem;
    padding: 2rem;

    p {
      font-family: 'Space Mono', monospace;
      font-size: 0.7rem;
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: 0.06em;
      margin: 0 0 0.5rem;
    }

    .mode-btn {
      width: 100%;
      max-width: 320px;
      padding: 1.1rem 1.25rem;
      border: 2px solid var(--rule);
      box-shadow: 4px 4px 0 var(--rule);
      background: var(--paper);
      cursor: pointer;
      text-align: left;
      transition: background 0.1s;

      &:hover { background: var(--tint); }
      &:focus { outline: 2px solid var(--hot); outline-offset: 2px; }

      .mode-title {
        font-family: 'Bowlby One', sans-serif;
        font-size: 0.95rem;
        color: var(--hot);
        display: block;
        margin-bottom: 0.3rem;
      }

      .mode-desc {
        font-family: 'Space Mono', monospace;
        font-size: 0.65rem;
        color: var(--muted);
        display: block;
        line-height: 1.5;
      }
    }
  }

  .change-mode {
    background: none;
    border: none;
    font-family: 'Space Mono', monospace;
    font-size: 0.62rem;
    color: var(--muted);
    cursor: pointer;
    padding: 0;
    text-decoration: underline;

    &:hover { color: var(--ink); }
    &:focus { outline: 2px solid var(--hot); }
  }

  .messages {
    flex: 1;
    overflow-y: auto;
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .msg {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;

    &.user { align-items: flex-end; }
    &.assistant { align-items: flex-start; }

    .bubble {
      font-family: 'Newsreader', serif;
      font-size: 0.9rem;
      line-height: 1.55;
      padding: 0.6rem 0.8rem;
      border: 1.5px solid var(--rule);
      max-width: 88%;
      white-space: pre-wrap;
    }

    &.user .bubble {
      background: var(--ink);
      color: var(--paper);
      box-shadow: 2px 2px 0 var(--hot);
    }

    &.assistant .bubble {
      background: var(--paper);
      box-shadow: 2px 2px 0 var(--rule);
    }

    .chips {
      display: flex;
      flex-wrap: wrap;
      gap: 0.4rem;
      max-width: 100%;
    }
  }

  .shimmer {
    display: flex;
    gap: 0.3rem;
    padding: 0.5rem 0.8rem;
    border: 1.5px solid var(--rule);
    background: var(--tint);
    align-self: flex-start;

    span {
      width: 0.5rem;
      height: 0.5rem;
      background: var(--muted);
      border-radius: 50%;
      animation: bounce 0.9s infinite;

      &:nth-child(2) { animation-delay: 0.15s; }
      &:nth-child(3) { animation-delay: 0.3s; }
    }
  }

  @keyframes bounce {
    0%, 80%, 100% { transform: translateY(0); }
    40% { transform: translateY(-6px); }
  }

  .option-bar {
    border-top: 2px solid var(--rule);
    padding: 0.6rem 0.75rem;
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    flex-shrink: 0;
    background: var(--tint);

    button {
      font-family: 'Space Mono', monospace;
      font-size: 0.65rem;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      padding: 0.4rem 0.75rem;
      border: 1.5px solid var(--rule);
      box-shadow: 2px 2px 0 var(--rule);
      background: var(--paper);
      color: var(--ink);
      cursor: pointer;

      &:hover:not(:disabled) { background: var(--ink); color: var(--paper); }
      &:disabled { opacity: 0.35; cursor: default; }
      &:focus { outline: 2px solid var(--hot); outline-offset: 1px; }
    }
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
  props: {
    artist: { type: Object, required: true },
  },
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

export default {
  name: "RecommendPanel",
  components: { ArtistChip },
  props: {
    artists: { type: Array, required: true },
    venues: { type: Object, required: true },
    distances: { type: Object, required: true },
  },
  emits: ["close", "open-artist"],
  setup(props, { emit }) {
    const messages = ref([]);
    const loading = ref(false);
    const error = ref("");
    const streamingText = ref("");
    const mode = ref(null); // null | 'now' | 'today'

    const hasKey = computed(() => !!apiKey.value);

    const modeLabel = computed(() => {
      if (mode.value === "now") return "On soon";
      if (mode.value === "today") return "Today";
      return "Recommend me something";
    });

    // Options from the last assistant message (hidden while loading)
    const currentOptions = computed(() => {
      if (loading.value) return [];
      for (let i = messages.value.length - 1; i >= 0; i--) {
        if (messages.value[i].role === "assistant") {
          return messages.value[i].options || [];
        }
      }
      return [];
    });

    function onKeydown(e) {
      if (e.key === "Escape") emit("close");
    }

    function artistsForMode(selectedMode) {
      if (selectedMode === "now") {
        const upcoming = upcomingArtists(props.artists, Date.now());
        return upcoming.length > 0 ? upcoming : props.artists;
      }
      if (selectedMode === "today") {
        const today = festivalDayFor(Date.now());
        if (today) {
          const dayArtists = props.artists.filter((a) =>
            a.gigs.some((g) => (g.festival_day || g.day) === today)
          );
          return dayArtists.length > 0 ? dayArtists : props.artists;
        }
      }
      return props.artists;
    }

    async function sendMessage(userText, { addToUI = true, selectedMode } = {}) {
      if (loading.value) return;

      error.value = "";
      loading.value = true;
      streamingText.value = "";

      const history = messages.value.map((m) => ({ role: m.role, content: m.content }));

      if (userText) {
        history.push({ role: "user", content: userText });
        if (addToUI) {
          messages.value.push({ role: "user", content: userText, text: userText, recommendations: [], options: [] });
        }
      }

      const activeMode = selectedMode ?? mode.value;
      const scopedArtists = artistsForMode(activeMode);
      const systemPrompt = buildSystemPrompt(scopedArtists, props.venues, props.distances, { mode: activeMode });

      const MAX_RETRIES = 2;
      let parsed = null;
      let lastFull = "";

      try {
        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
          let full = "";
          const attemptHistory = attempt === 0
            ? history
            : [
                ...history,
                {
                  role: "system",
                  content: "Your last reply was rejected: 'options' was missing or empty. The user can ONLY respond by clicking buttons — there is no text input. Reply again with the same JSON shape and include an 'options' array of 2–5 short button labels. Never leave options empty.",
                },
              ];

          for await (const chunk of streamCompletion(apiKey.value, model.value, attemptHistory, systemPrompt)) {
            full += chunk;
            streamingText.value = full;
            await nextTick();
            scrollToBottom();
          }

          lastFull = full;
          parsed = parseAIResponse(full);
          if (parsed.options.length > 0) break;

          // Options missing — clear the partial bubble before retrying
          streamingText.value = "";
          if (attempt === MAX_RETRIES) {
            error.value = "Couldn't get response options — try again.";
            parsed = null;
          }
        }

        if (parsed) {
          const recs = parsed.recommendations
            .map((slug) => props.artists.find((a) => a.slug === slug))
            .filter(Boolean);
          messages.value.push({
            role: "assistant",
            content: lastFull,
            text: parsed.text,
            recommendations: recs,
            options: parsed.options,
          });
        }
      } catch (e) {
        error.value = e.message;
      } finally {
        loading.value = false;
        streamingText.value = "";
        await nextTick();
        scrollToBottom();
      }
    }

    function selectMode(selectedMode) {
      mode.value = selectedMode;
      const startText = selectedMode === "now"
        ? "What's good right now? I need to decide quickly."
        : "Help me plan what to watch today.";
      sendMessage(startText, { addToUI: false, selectedMode });
    }

    function resetMode() {
      mode.value = null;
      messages.value = [];
      error.value = "";
    }

    function selectOption(label) {
      sendMessage(label, { addToUI: true });
    }

    function scrollToBottom() {
      const el = document.querySelector(".recommend-messages");
      if (el) el.scrollTop = el.scrollHeight;
    }

    return { messages, loading, error, streamingText, hasKey, mode, modeLabel, currentOptions, sendMessage, selectMode, resetMode, selectOption, onKeydown };
  },
  mounted() {
    document.body.classList.add("recommend-open");
    document.addEventListener("keydown", this.onKeydown);
    this._release = trapFocus(this.$refs.sheet);
  },
  beforeUnmount() {
    document.body.classList.remove("recommend-open");
    document.removeEventListener("keydown", this.onKeydown);
    if (this._release) this._release();
  },
  template: `
    <teleport to="#teleport-root">
      <div :class="$options.panelCls" role="dialog" aria-modal="true" aria-label="AI Recommendations">
        <div class="backdrop" @click="$emit('close')"></div>
        <div class="sheet" ref="sheet">
          <div class="panel-header">
            <h2>{{ modeLabel }}</h2>
            <div style="display:flex;align-items:center;gap:0.75rem">
              <button v-if="mode" class="change-mode" @click="resetMode">← Change</button>
              <button @click="$emit('close')" aria-label="Close">✕</button>
            </div>
          </div>

          <div v-if="!hasKey" class="no-key">
            <div>
              <strong>No API key set</strong>
              Add an OpenRouter key in Settings to use AI recommendations.
            </div>
          </div>

          <div v-else-if="mode === null" class="mode-select">
            <p>What are you after?</p>
            <button class="mode-btn" @click="selectMode('now')">
              <span class="mode-title">What's on soon?</span>
              <span class="mode-desc">Quick picks from acts starting in the next 90 minutes</span>
            </button>
            <button class="mode-btn" @click="selectMode('today')">
              <span class="mode-title">What should I watch today?</span>
              <span class="mode-desc">Help planning your full day at the festival</span>
            </button>
          </div>

          <template v-else>
            <div class="messages recommend-messages">
              <div
                v-for="(msg, i) in messages"
                :key="i"
                :class="['msg', msg.role]"
              >
                <div class="bubble">{{ msg.text }}</div>
                <div v-if="msg.recommendations.length" class="chips">
                  <ArtistChip
                    v-for="a in msg.recommendations"
                    :key="a.slug"
                    :artist="a"
                    @open="$emit('open-artist', $event)"
                  />
                </div>
              </div>

              <div v-if="loading" class="msg assistant">
                <div v-if="streamingText" class="bubble">{{ streamingText }}</div>
                <div v-else class="shimmer">
                  <span></span><span></span><span></span>
                </div>
              </div>

              <div v-if="error" class="msg assistant">
                <div class="bubble" style="color:var(--hot)">{{ error }}</div>
              </div>
            </div>

            <div v-if="currentOptions.length || loading" class="option-bar" aria-label="Options">
              <button
                v-for="opt in currentOptions"
                :key="opt"
                :disabled="loading"
                @click="selectOption(opt)"
              >{{ opt }}</button>
            </div>
          </template>
        </div>
      </div>
    </teleport>
  `,
  panelCls,
};
