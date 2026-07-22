import { centralDate } from "../lib/central-time.js";

// GET /api/leaderboard
// Reads today's leaderboard from D1 (binding: env.DB).
// Ranking contract: score DESC, tiebreak earliest created_at (never by
// elapsed time). Read-only and public. Each entry also carries the placements
// that earned the score, so the board can replay another player's word — the
// frontend gates that behind a "this locks your own submission" warning.
export async function onRequestGet({ env }) {
  const date = centralDate();

  try {
    const { results } = await env.DB
      .prepare(
        `SELECT name, score, created_at, placements
           FROM leaderboard
          WHERE puzzle_date = ?
          ORDER BY score DESC, created_at ASC
          LIMIT 10`
      )
      .bind(date)
      .all();

    const entries = (results || []).map((row, i) => ({
      rank: i + 1,
      name: row.name,
      score: row.score,
      created_at: row.created_at,
      placements: parsePlacements(row.placements),
    }));

    return json({ date, entries });
  } catch (err) {
    return json({ date, entries: [], error: "leaderboard_unavailable" }, 500);
  }
}

// Old rows (and the demo seed) have no placements — return null so the client
// simply omits the "view" button for them.
function parsePlacements(raw) {
  if (typeof raw !== "string" || !raw) return null;
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) && arr.length ? arr : null;
  } catch {
    return null;
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
