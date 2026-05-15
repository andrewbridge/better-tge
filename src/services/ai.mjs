import { formatTime } from "../utilities/format.mjs";
import { FESTIVAL_NAME } from "./festival.mjs";

const OPENROUTER_BASE = "https://openrouter.ai/api/v1";

// ── Prompt building ──────────────────────────────────────────────────────────

function compactArtist(a) {
  const genres = a.genres.length ? ` [${a.genres.join("/")}]` : "";
  const gigs = a.gigs
    .map((g) => `${(g.festival_day || g.day).slice(0, 3)} ${formatTime(g.start)} @ ${g.venue_name || g.venue}`)
    .join(", ");
  return `${a.name}${genres}: ${gigs || "TBC"}`;
}

function distanceText(distances) {
  const lines = [];
  for (const [from, targets] of Object.entries(distances)) {
    for (const [to, metres] of Object.entries(targets)) {
      if (from < to) {
        lines.push(`${from} ↔ ${to}: ${metres}m`);
      }
    }
  }
  return lines.join("\n");
}

const NOW_WINDOW_MS = 90 * 60 * 1000; // 90 minutes

export function upcomingArtists(artists, nowMs = Date.now()) {
  return artists.filter((a) =>
    a.gigs.some((g) => {
      const start = new Date(g.start).getTime();
      return start >= nowMs && start <= nowMs + NOW_WINDOW_MS;
    })
  );
}

export function buildSystemPrompt(artists, venues, distances, options = {}) {
  const { mode, currentDay } = options;

  const venueList = Object.entries(venues)
    .map(([slug, v]) => `  ${slug}: ${v.name}${v.address ? ` (${v.address})` : ""}`)
    .join("\n");

  const distText = distanceText(distances);

  const artistList = artists
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(compactArtist)
    .join("\n");

  const modeInstruction = mode === "now"
    ? "\nTIME MODE: only acts starting in the next 90 minutes are listed. Ask at most 1 quick question, then go straight to 3–5 picks. The user needs to decide fast."
    : mode === "today"
    ? "\nDAY MODE: help the user plan their full day. Ask about mood, energy, and any acts already seen, then give 5–7 picks across the day with timing context."
    : "";

  const currentDayLine = currentDay ? `\nCURRENT FESTIVAL DAY: ${currentDay}` : "";

  return `You are a music discovery assistant for ${FESTIVAL_NAME}, a multi-venue festival in Brighton, UK running Wed 13–Sat 16 May 2026.

Help the user build their perfect schedule. Be enthusiastic but concise — they're at a festival.

RESPONSE FORMAT — always reply with valid JSON, no markdown fences:
{"text":"your message here","recommendations":["artist-slug-1","artist-slug-2"],"options":["Energetic","Chill","Surprise me"]}

CRITICAL: the user interface has NO text input. The "options" array is the user's ONLY way to reply. Every response MUST include 2–5 short button labels (max ~5 words each) that move the conversation forward. Never leave "options" empty.

- "text": plain English, 1–3 short paragraphs. Mention timing conflicts and venue proximity where relevant.
- "recommendations": slugs of artists you're actively suggesting (empty [] while still clarifying). Only recommend artists whose gigs appear in the LINEUP below — all listed gigs are on ${currentDay ? `${currentDay}` : "the current festival day"}.
- "options": 2–5 short button labels the user can click as their reply. NEVER empty.
  While clarifying: offer mood/genre/energy choices (e.g. "Energetic", "Mellow", "Discover something new").
  After picks: offer refinements (e.g. "More like this", "Swap a pick", "Show me something heavier").

FLOW:
1. First turn: ask 1–2 short clarifying questions about taste or mood, and provide the options as answers to those questions.
2. Once you have enough context: give 4–7 targeted picks with brief reasoning. Still include options for follow-up refinements.
3. On follow-up: refine, add or swap picks based on feedback.${modeInstruction}${currentDayLine}

VENUES:
${venueList}

VENUE WALKING DISTANCES (metres, straight-line):
${distText || "No distance data available."}

LINEUP (${artists.length} artists playing today):
${artistList}`;
}

// ── API call ─────────────────────────────────────────────────────────────────

/**
 * Stream a chat completion from OpenRouter.
 * Yields string chunks as they arrive.
 * @param {string} apiKey
 * @param {string} modelId
 * @param {Array<{role:string,content:string}>} messages
 * @param {string} systemPrompt
 */
export async function* streamCompletion(apiKey, modelId, messages, systemPrompt) {
  const response = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": window.location.origin,
      "X-Title": "better-tge",
    },
    body: JSON.stringify({
      model: modelId,
      stream: true,
      messages: [
        { role: "system", content: systemPrompt },
        ...messages,
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenRouter ${response.status}: ${body.slice(0, 200)}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop();
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const payload = line.slice(6).trim();
      if (payload === "[DONE]") return;
      try {
        const chunk = JSON.parse(payload);
        const delta = chunk.choices?.[0]?.delta?.content;
        if (delta) yield delta;
      } catch (_) {}
    }
  }
}

/**
 * Parse the AI's JSON response envelope.
 * Returns { text, recommendations } — gracefully handles malformed JSON.
 */
export function parseAIResponse(raw) {
  try {
    // Strip any accidental markdown fences the model added
    const cleaned = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
    const parsed = JSON.parse(cleaned);
    return {
      text: String(parsed.text || raw),
      recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations : [],
      options: Array.isArray(parsed.options) ? parsed.options.map(String) : [],
    };
  } catch (_) {
    return { text: raw, recommendations: [], options: [] };
  }
}
