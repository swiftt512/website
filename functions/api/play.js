import { centralDate } from "../lib/central-time.js";
import { getDailyPuzzle } from "../lib/puzzle.js";
import { analyzePlay } from "../lib/scoring.js";

// POST /api/play
// Body: { name, placements: [{ letter, row, col }] }
//
// The client submits ONLY where it placed tiles, never a score. The server
// loads today's puzzle, independently checks the move is legal (tiles came from
// the rack, form contiguous connected words), validates every word against the
// ENABLE dictionary in D1, and computes the score itself. A client-supplied
// score field, if present, is ignored on purpose; never trust it.
export async function onRequestPost({ env, request }) {
  const date = centralDate();

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "bad_request", detail: "Invalid JSON." }, 400);
  }

  const placements = body && body.placements;
  const name = sanitizeName(body && body.name);

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
    return json({ error: analysis.error, detail: analysis.detail }, 400);
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
    return json(
      { error: "not_a_word", detail: "Not a word: " + invalid.map((w) => w.toUpperCase()).join(", "), invalid },
      422
    );
  }

  // Legal move: record the server-computed score. We also store the placements
  // (already validated above) so the leaderboard can replay this word onto the
  // board for other players. It's the player's own move, not a hidden answer.
  const createdAt = new Date().toISOString();
  const stored = JSON.stringify(
    placements.map((p) => ({ letter: String(p.letter).toLowerCase(), row: p.row, col: p.col }))
  );

  // One line per player per day: keep only their best score. Look up any row(s)
  // this name already has today; update the best-scoring one in place if this
  // play beats it, and collapse any leftover duplicates from earlier behavior.
  let existing;
  try {
    existing = await env.DB
      .prepare(
        "SELECT id, score FROM leaderboard WHERE puzzle_date = ? AND name = ? ORDER BY score DESC, created_at ASC"
      )
      .bind(date, name)
      .all();
  } catch {
    return json({ error: "save_failed" }, 500);
  }

  const rows = existing.results || [];
  const prevBest = rows.length ? rows[0].score : null;
  const improved = prevBest == null || analysis.score > prevBest;

  try {
    if (rows.length) {
      // Drop any extra rows so the player occupies exactly one line.
      if (rows.length > 1) {
        const extra = rows.slice(1).map((r) => r.id);
        const ph = extra.map(() => "?").join(",");
        await env.DB.prepare(`DELETE FROM leaderboard WHERE id IN (${ph})`).bind(...extra).run();
      }
      if (improved) {
        await env.DB
          .prepare("UPDATE leaderboard SET score = ?, created_at = ?, placements = ? WHERE id = ?")
          .bind(analysis.score, createdAt, stored, rows[0].id)
          .run();
      }
    } else {
      await env.DB
        .prepare("INSERT INTO leaderboard (puzzle_date, name, score, created_at, placements) VALUES (?, ?, ?, ?, ?)")
        .bind(date, name, analysis.score, createdAt, stored)
        .run();
    }
  } catch {
    return json({ error: "save_failed" }, 500);
  }

  return json({
    ok: true,
    date,
    name,
    score: analysis.score,
    best: improved ? analysis.score : prevBest,
    improved,
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

function sanitizeName(raw) {
  const s = (typeof raw === "string" ? raw : "").toUpperCase().replace(/[^A-Z0-9 ]/g, "").trim().slice(0, 12);
  return s || "ANON";
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
