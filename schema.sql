-- D1 schema for the daily-puzzle leaderboard.
-- Ranking contract: within a puzzle_date, order by score DESC, then earliest
-- created_at (never by elapsed play time). Writes come later from the verified
-- /api/play endpoint (Step 4) — this file only sets up structure + demo data.

CREATE TABLE IF NOT EXISTS leaderboard (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  puzzle_date TEXT    NOT NULL,   -- YYYY-MM-DD, the US-Central puzzle day
  name        TEXT    NOT NULL,   -- player display name
  score       INTEGER NOT NULL,
  created_at  TEXT    NOT NULL    -- ISO-8601; tiebreak key (earliest wins)
);

-- Covers the daily leaderboard read: filter by date, order by rank.
CREATE INDEX IF NOT EXISTS idx_leaderboard_rank
  ON leaderboard (puzzle_date, score DESC, created_at ASC);

-- Demo rows for today so the live page shows data before Step 4.
-- Guarded so re-running this file never double-seeds.
INSERT INTO leaderboard (puzzle_date, name, score, created_at)
SELECT * FROM (
  SELECT '2026-07-21' AS d, 'ALEX'   AS n, 42 AS s, '2026-07-21T08:12:00-05:00' AS c UNION ALL
  SELECT '2026-07-21', 'JORDAN', 38, '2026-07-21T07:45:00-05:00' UNION ALL
  SELECT '2026-07-21', 'SAM',    31, '2026-07-21T09:03:00-05:00' UNION ALL
  SELECT '2026-07-21', 'TAYLOR', 27, '2026-07-21T06:58:00-05:00' UNION ALL
  SELECT '2026-07-21', 'MORGAN', 19, '2026-07-21T10:21:00-05:00'
)
WHERE NOT EXISTS (SELECT 1 FROM leaderboard WHERE puzzle_date = '2026-07-21');
