// GET /api/leaderboard
// Step 2: hardcoded JSON. In step 3 this reads from D1.
// Ranking contract: score DESC, tiebreak earliest created_at (never by elapsed time).
export function onRequestGet() {
  const entries = [
    { rank: 1, name: "ALEX",  score: 42, created_at: "2026-07-21T08:12:00-05:00" },
    { rank: 2, name: "JORDAN", score: 38, created_at: "2026-07-21T07:45:00-05:00" },
    { rank: 3, name: "SAM",   score: 31, created_at: "2026-07-21T09:03:00-05:00" },
    { rank: 4, name: "TAYLOR", score: 27, created_at: "2026-07-21T06:58:00-05:00" },
    { rank: 5, name: "MORGAN", score: 19, created_at: "2026-07-21T10:21:00-05:00" },
  ];

  return new Response(
    JSON.stringify({ date: "2026-07-21", entries }),
    {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      },
    }
  );
}
