// Pure placement validation + Scrabble scoring for one play.
//
// This is the heart of the anti-cheat model: given only the day's puzzle and
// the tiles the client claims to have placed, the server independently decides
// whether the move is legal and how much it is worth. The client never sends a
// score, and nothing here trusts one. Dictionary validation is done by the
// caller (it needs D1); this module reports which words were formed so the
// caller can check them, and computes the score once they're confirmed valid.

import { SIZE, LETTER_VALUES, BONUSES, seedCells } from "./puzzle.js";

const BINGO_BONUS = 30; // reward for using the entire rack in one play

const err = (error, detail) => ({ ok: false, error, detail });
const key = (r, c) => r + "," + c;

// analyzePlay(puzzle, placements)
//   placements: [{ letter, row, col }] — letters a-z, coords 0..SIZE-1.
// Returns { ok:false, error, detail } on any illegal move, otherwise
//   { ok:true, words:[{ text, cells }], score, usedAll } where `words` still
//   needs each `text` confirmed against the dictionary by the caller.
export function analyzePlay(puzzle, placements) {
  if (!Array.isArray(placements) || placements.length === 0) {
    return err("empty", "Place at least one tile.");
  }
  if (placements.length > 12) return err("too_many", "Too many tiles.");

  // --- Build the seed board (letters already on the board). ---
  const board = Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
  const seedSet = new Set();
  for (const { r, c, letter } of seedCells(puzzle)) {
    board[r][c] = letter;
    seedSet.add(key(r, c));
  }

  // --- Validate each placement and lay it down. ---
  const placedSet = new Set();
  const rows = new Set();
  const cols = new Set();
  const rackLeft = countLetters(puzzle.rack);

  for (const p of placements) {
    const r = p.row, c = p.col;
    const letter = typeof p.letter === "string" ? p.letter.toLowerCase() : "";
    if (!Number.isInteger(r) || !Number.isInteger(c) || r < 0 || c < 0 || r >= SIZE || c >= SIZE) {
      return err("off_board", "A tile is off the board.");
    }
    if (!/^[a-z]$/.test(letter)) return err("bad_letter", "Invalid tile.");
    const k = key(r, c);
    if (seedSet.has(k)) return err("occupied", "A tile lands on an existing letter.");
    if (placedSet.has(k)) return err("occupied", "Two tiles on the same square.");
    if (!rackLeft[letter]) return err("not_in_rack", "You played a tile that isn't in your rack.");
    rackLeft[letter]--;
    placedSet.add(k);
    rows.add(r);
    cols.add(c);
    board[r][c] = letter;
  }

  // --- All placed tiles must share one row or one column. ---
  const oneRow = rows.size === 1;
  const oneCol = cols.size === 1;
  if (!oneRow && !oneCol) return err("not_a_line", "Tiles must be in a single row or column.");

  // --- No gaps: the span of the play must be fully filled (seed or new). ---
  if (oneRow && placements.length > 1) {
    const r = [...rows][0];
    const cs = [...cols].sort((a, b) => a - b);
    for (let c = cs[0]; c <= cs[cs.length - 1]; c++) {
      if (!board[r][c]) return err("gap", "The tiles must be contiguous.");
    }
  }
  if (oneCol && placements.length > 1) {
    const c = [...cols][0];
    const rs = [...rows].sort((a, b) => a - b);
    for (let r = rs[0]; r <= rs[rs.length - 1]; r++) {
      if (!board[r][c]) return err("gap", "The tiles must be contiguous.");
    }
  }

  // --- Enumerate every word (maximal run >= 2) that includes a placed tile. ---
  const words = [];
  const collect = (cells) => {
    if (cells.length < 2) return;
    if (!cells.some((cell) => placedSet.has(key(cell.r, cell.c)))) return;
    words.push({
      text: cells.map((cell) => board[cell.r][cell.c]).join(""),
      cells,
    });
  };

  for (let r = 0; r < SIZE; r++) {
    let run = [];
    for (let c = 0; c <= SIZE; c++) {
      if (c < SIZE && board[r][c]) run.push({ r, c });
      else { collect(run); run = []; }
    }
  }
  for (let c = 0; c < SIZE; c++) {
    let run = [];
    for (let r = 0; r <= SIZE; r++) {
      if (r < SIZE && board[r][c]) run.push({ r, c });
      else { collect(run); run = []; }
    }
  }

  if (words.length === 0) return err("no_word", "Your tiles must form a word of 2+ letters.");

  // --- Must connect to the existing board (some word reuses a seed tile). ---
  const connected = words.some((w) => w.cells.some((cell) => seedSet.has(key(cell.r, cell.c))));
  if (!connected) return err("disconnected", "Your word must connect to the letters already on the board.");

  // --- Score (bonuses count only under newly placed tiles). ---
  let score = 0;
  for (const w of words) {
    let wordScore = 0;
    let wordMult = 1;
    for (const cell of w.cells) {
      const letter = board[cell.r][cell.c];
      const value = LETTER_VALUES[letter] || 0;
      if (placedSet.has(key(cell.r, cell.c))) {
        const bonus = BONUSES[cell.r][cell.c];
        if (bonus === "dl") wordScore += value * 2;
        else if (bonus === "tl") wordScore += value * 3;
        else wordScore += value;
        if (bonus === "dw") wordMult *= 2;
        else if (bonus === "tw") wordMult *= 3;
      } else {
        wordScore += value; // seed tile: face value, no premium
      }
    }
    score += wordScore * wordMult;
  }

  const usedAll = placements.length === puzzle.rack.length;
  if (usedAll) score += BINGO_BONUS;

  return { ok: true, words, score, usedAll };
}

function countLetters(arr) {
  const m = {};
  for (const ch of arr) m[ch] = (m[ch] || 0) + 1;
  return m;
}
