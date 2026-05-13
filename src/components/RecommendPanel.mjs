import { ref, computed, nextTick } from "../deps/vue.mjs";
import { css, glob } from "../deps/goober.mjs";
import { apiKey, model } from "../services/settings.mjs";
import { buildSystemPrompt, streamCompletion, parseAIResponse } from "../services/ai.mjs";
import { toggle as toggleShortlist, has as inShortlist } from "../services/shortlist.mjs";
import { trapFocus } from "../utilities/focus-trap.mjs";

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

  .composer {
    display: flex;
    gap: 0;
    border-top: 2px solid var(--rule);
    flex-shrink: 0;

    textarea {
      flex: 1;
      font-family: 'Newsreader', serif;
      font-size: 0.9rem;
      padding: 0.6rem 0.75rem;
      border: none;
      background: var(--paper);
      color: var(--ink);
      resize: none;
      min-height: 2.8rem;
      max-height: 8rem;
      line-height: 1.5;

      &:focus { outline: none; }
    }

    button {
      font-family: 'Space Mono', monospace;
      font-size: 0.65rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      background: var(--hot);
      color: var(--paper);
      border: none;
      border-left: 2px solid var(--rule);
      padding: 0 1rem;
      cursor: pointer;
      flex-shrink: 0;

      &:disabled { background: var(--tint); color: var(--muted); cursor: default; }
      &:focus { outline: 2px solid var(--ink); outline-offset: -2px; }
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
    const messages = ref([]);        // [{role, content, text, recommendations}]
    const input = ref("");
    const loading = ref(false);
    const error = ref("");
    const streamingText = ref("");

    const hasKey = computed(() => !!apiKey.value);

    function onKeydown(e) {
      if (e.key === "Escape") emit("close");
    }

    async function send() {
      const text = input.value.trim();
      if (!text || loading.value) return;

      error.value = "";
      input.value = "";
      messages.value.push({ role: "user", content: text, text, recommendations: [] });
      loading.value = true;
      streamingText.value = "";

      const history = messages.value.map((m) => ({ role: m.role, content: m.content }));
      const systemPrompt = buildSystemPrompt(props.artists, props.venues, props.distances);

      let full = "";
      try {
        for await (const chunk of streamCompletion(apiKey.value, model.value, history, systemPrompt)) {
          full += chunk;
          streamingText.value = full;
          await nextTick();
          scrollToBottom();
        }
        const parsed = parseAIResponse(full);
        const recs = parsed.recommendations
          .map((slug) => props.artists.find((a) => a.slug === slug))
          .filter(Boolean);
        messages.value.push({
          role: "assistant",
          content: full,
          text: parsed.text,
          recommendations: recs,
        });
      } catch (e) {
        error.value = e.message;
      } finally {
        loading.value = false;
        streamingText.value = "";
        await nextTick();
        scrollToBottom();
      }
    }

    function scrollToBottom() {
      const el = document.querySelector(".recommend-messages");
      if (el) el.scrollTop = el.scrollHeight;
    }

    function onTextareaKey(e) {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        send();
      }
    }

    return { messages, input, loading, error, streamingText, hasKey, send, onKeydown, onTextareaKey };
  },
  mounted() {
    document.body.classList.add("recommend-open");
    document.addEventListener("keydown", this.onKeydown);
    this._release = trapFocus(this.$el.querySelector(".sheet"));

    // Kick off with an initial AI prompt if no messages yet
    if (this.messages.length === 0 && this.hasKey) {
      this.input = "Start";
      this.send();
    }
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
        <div class="sheet">
          <div class="panel-header">
            <h2>Recommend me something</h2>
            <button @click="$emit('close')" aria-label="Close">✕</button>
          </div>

          <div v-if="!hasKey" class="no-key">
            <div>
              <strong>No API key set</strong>
              Add an OpenRouter key in Settings to use AI recommendations.
            </div>
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

            <div class="composer">
              <textarea
                v-model="input"
                :disabled="loading"
                rows="1"
                placeholder="What are you in the mood for?"
                aria-label="Message"
                @keydown="onTextareaKey"
              ></textarea>
              <button :disabled="!input.trim() || loading" @click="send">Send</button>
            </div>
          </template>
        </div>
      </div>
    </teleport>
  `,
  panelCls,
};
