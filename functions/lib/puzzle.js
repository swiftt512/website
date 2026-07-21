// Shared board constants + today's-puzzle loader.
//
// The board geometry (size + premium squares) is FIXED — like a real Scrabble
// board, only the tiles change day to day. The daily starting words + rack come
// from the pre-generated `puzzles` table (see tools/gen-puzzles.mjs). Both
// /api/puzzle (display) and /api/play (verification) import from here so they
// always agree on geometry and letter values.

export const SIZE = 9;

// Standard Scrabble letter values.
export const LETTER_VALUES = {
  a: 1, b: 3, c: 3, d: 2, e: 1, f: 4, g: 2, h: 4, i: 1, j: 8, k: 5, l: 1, m: 3,
  n: 1, o: 1, p: 3, q: 10, r: 1, s: 1, t: 1, u: 1, v: 4, w: 4, x: 8, y: 4, z: 10,
};

// Premium squares, symmetric. "" = plain, dl/tl = double/triple letter,
// dw/tw = double/triple word. Center (4,4) is a double-word star.
export const BONUSES = [
  ["tw", "",   "",   "dl", "",   "dl", "",   "",   "tw"],
  ["",   "dw", "",   "",   "tl", "",   "",   "dw", ""  ],
  ["",   "",   "dw", "",   "",   "",   "dw", "",   ""  ],
  ["dl", "",   "",   "dw", "",   "dw", "",   "",   "dl"],
  ["",   "tl", "",   "",   "dw", "",   "",   "tl", ""  ],
  ["dl", "",   "",   "dw", "",   "dw", "",   "",   "dl"],
  ["",   "",   "dw", "",   "",   "",   "dw", "",   ""  ],
  ["",   "dw", "",   "",   "tl", "",   "",   "dw", ""  ],
  ["tw", "",   "",   "dl", "",   "dl", "",   "",   "tw"],
];

// Load today's pre-generated puzzle from D1. Returns the parsed JSON
// ({size, words:[{w,r,c,dir}], rack:[...]}) or null if none seeded for `date`.
export async function getDailyPuzzle(env, date) {
  const row = await env.DB
    .prepare("SELECT data FROM puzzles WHERE puzzle_date = ?")
    .bind(date)
    .first();
  if (!row) return null;
  try {
    return JSON.parse(row.data);
  } catch {
    return null;
  }
}

// Expand a puzzle's word list into the individual pre-placed seed cells.
// Returns [{ r, c, letter }]. Overlapping crossings resolve to the same letter.
export function seedCells(puzzle) {
  const out = [];
  for (const { w, r, c, dir } of puzzle.words) {
    for (let i = 0; i < w.length; i++) {
      out.push({
        r: dir === "H" ? r : r + i,
        c: dir === "H" ? c + i : c,
        letter: w[i],
      });
    }
  }
  return out;
}
