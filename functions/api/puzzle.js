import { centralDate } from "../lib/central-time.js";
import { getDailyPuzzle, SIZE, BONUSES, LETTER_VALUES } from "../lib/puzzle.js";

// GET /api/puzzle
// Serves today's starting board: fixed geometry (size + premium squares),
// the 2-3 pre-placed interlocking words, and the day's rack. Everything here
// is meant to be visible to the player; the game is open-ended, so there is no
// hidden "answer" or optimal score to leak. Scoring happens only in /api/play.
export async function onRequestGet({ env }) {
  const date = centralDate();
  try {
    const puzzle = await getDailyPuzzle(env, date);
    if (!puzzle) return json({ date, error: "no_puzzle" }, 404);
    return json({
      date,
      size: SIZE,
      bonuses: BONUSES,
      values: LETTER_VALUES,
      words: puzzle.words, // pre-placed starting words
      rack: puzzle.rack,
    });
  } catch (err) {
    return json({ date, error: "puzzle_unavailable" }, 500);
  }
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
