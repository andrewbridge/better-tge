import { formatTime } from "../utilities/format.mjs";
import { FESTIVAL_NAME } from "./festival.mjs";

const OPENROUTER_BASE = "https://openrouter.ai/api/v1";

// ── Prompt building ──────────────────────────────────────────────────────────

function compactArtist(a) {
  const genres = a.genres.length ? ` [${a.genres.join("/")}]` : "";
  const gigs = a.gigs
    .map((g) => `${g.day.slice(0, 3)} ${formatTime(g.start)} @ ${g.venue_name || g.venue}`)
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

export function buildSystemPrompt(artists, venues, distances) {
  const venueList = Object.entries(venues)
    .map(([slug, v]) => `  ${slug}: ${v.name}${v.address ? ` (${v.address})` : ""}`)
    .join("\n");

  const distText = distanceText(distances);

  const artistList = artists
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(compactArtist)
    .join("\n");

  // Determine today's festival day for context
  const DAY_NAMES = { 3: "Wednesday", 4: "Thursday", 5: "Friday", 6: "Saturday" };
  const todayName = DAY_NAMES[new Date().getDay()] || "today";

  return `You are a music discovery assistant for ${FESTIVAL_NAME}, a multi-venue festival in Brighton, UK running Wed 13–Sat 16 May 2026. Today is ${todayName}.

RESPONSE FORMAT — always reply with a single line of valid JSON, no markdown fences:
{"text":"...","recommendations":["slug1","slug2"],"options":["Label A","Label B","Label C"]}

- "text": 1–2 sentences. Friendly and concise.
- "recommendations": 0–3 artist slugs when you have enough context to suggest. Otherwise [].
- "options": always exactly 2–4 short button labels (≤5 words each). These are buttons the user will tap.

FLOW:
1. First response: ask one question about their vibe with 3–4 option buttons (e.g. "High energy bangers", "Chilled discoveries", "Heavy guitars", "Surprise me").
2. After user picks an option: recommend 2–3 artists + offer refinement buttons ("More like this", "More electronic", "Something heavier", "Different vibe").
3. Keep refining. Always end with options — include "Start over" if the user seems done.

VENUES:
${venueList}

VENUE WALKING DISTANCES (metres, straight-line):
${distText || "No distance data available."}

LINEUP (${artists.length} artists, focus on ${todayName} unless asked otherwise):
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
 * Returns { text, recommendations, options } — gracefully handles malformed JSON.
 */
export function parseAIResponse(raw) {
  try {
    // Strip any accidental markdown fences the model added
    const cleaned = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
    const parsed = JSON.parse(cleaned);
    return {
      text: String(parsed.text || raw),
      recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations : [],
      options: Array.isArray(parsed.options) ? parsed.options.slice(0, 4) : [],
    };
  } catch (_) {
    return { text: raw, recommendations: [], options: [] };
  }
}
