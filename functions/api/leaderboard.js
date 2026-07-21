import { centralDate } from "../lib/central-time.js";

// GET /api/leaderboard
// Reads today's leaderboard from D1 (binding: env.DB).
// Ranking contract: score DESC, tiebreak earliest created_at (never by
// elapsed time). Read-only and public — it exposes only names + scores, so
// there's nothing here a client could use to cheat.
export async function onRequestGet({ env }) {
  const date = centralDate();

  try {
    const { results } = await env.DB
      .prepare(
        `SELECT name, score, created_at
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
    }));

    return json({ date, entries });
  } catch (err) {
    return json({ date, entries: [], error: "leaderboard_unavailable" }, 500);
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
