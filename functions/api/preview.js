import { centralDate } from "../lib/central-time.js";
import { getDailyPuzzle } from "../lib/puzzle.js";
import { analyzePlay } from "../lib/scoring.js";

// POST /api/preview
// Body: { placements: [{ letter, row, col }] }
//
// Same verification as /api/play, but READ-ONLY: it never writes to the
// leaderboard. It exists so the board can always show the current move's score
// and validity without the client ever computing a score itself. The server is
// still the only thing that scores or judges a word; this endpoint just reports
// the result of the tiles the player has already placed (never an "answer" or an
// optimal move), so it leaks nothing a determined player couldn't get by
// submitting. No name, no side effects.
export async function onRequestPost({ env, request }) {
  const date = centralDate();

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "bad_request", detail: "Invalid JSON." }, 400);
  }

  const placements = body && body.placements;

  let puzzle;
  try {
    puzzle = await getDailyPuzzle(env, date);
  } catch {
    return json({ error: "puzzle_unavailable" }, 500);
  }
  if (!puzzle) return json({ date, error: "no_puzzle" }, 404);

  // Structural + rack + scoring checks (no dictionary yet).
  const analysis = analyzePlay(puzzle, placements);
  if (!analysis.ok) {
    return json({ ok: false, valid: false, error: analysis.error, detail: analysis.detail }, 200);
  }

  // Every formed word must be a real word.
  const texts = [...new Set(analysis.words.map((w) => w.text))];
  let known;
  try {
    known = await lookupWords(env, texts);
  } catch {
    return json({ error: "dictionary_unavailable" }, 500);
  }
  const invalid = texts.filter((t) => !known.has(t));
  if (invalid.length) {
    return json({
      ok: false,
      valid: false,
      error: "not_a_word",
      detail: "Not a word: " + invalid.map((w) => w.toUpperCase()).join(", "),
      invalid,
    }, 200);
  }

  // Legal, all-real move: report the score, but record nothing.
  return json({
    ok: true,
    valid: true,
    date,
    score: analysis.score,
    usedAll: analysis.usedAll,
    words: analysis.words.map((w) => ({ text: w.text.toUpperCase() })),
  });
}

// Returns a Set of the words (lowercase) that exist in the dictionary.
async function lookupWords(env, texts) {
  if (texts.length === 0) return new Set();
  const placeholders = texts.map(() => "?").join(",");
  const { results } = await env.DB
    .prepare(`SELECT word FROM dictionary WHERE word IN (${placeholders})`)
    .bind(...texts)
    .all();
  return new Set((results || []).map((r) => r.word));
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
