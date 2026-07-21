// Offline daily-puzzle generator.
//
// Builds a deterministic 2-3 word interlocking crossword + an 8-tile rack for
// each calendar date and emits SQL that seeds the D1 `puzzles` table. Run
// offline (never at request time) — crossword search is not 10ms-safe.
//
//   node gen-puzzles.mjs <enable1.txt> <out.sql> <START YYYY-MM-DD> [DAYS]
//
// Placement obeys standard crossword rules (words only touch at legal
// crossings, no accidental parallel adjacencies, no run extensions), so the
// only words on the starting board are exactly the ones we place — all drawn
// from ENABLE, so all valid.
import fs from "node:fs";

const SIZE = 9;
const RACK_SIZE = 8;
const VOWELS = new Set(["a", "e", "i", "o", "u"]);
// Standard Scrabble tile distribution (blanks excluded).
const BAG = { a:9,b:2,c:2,d:4,e:12,f:2,g:3,h:2,i:9,j:1,k:1,l:4,m:2,n:6,o:8,p:2,q:1,r:6,s:4,t:6,u:4,v:2,w:2,x:1,y:2,z:1 };

const [, , dictPath, outPath, START, DAYS_ARG] = process.argv;
const DAYS = parseInt(DAYS_ARG || "540", 10);

const all = fs.readFileSync(dictPath, "utf8").split("\n").map((s) => s.trim()).filter(Boolean);
const pool = all.filter((w) => w.length >= 3 && w.length <= 7 && /^[a-z]+$/.test(w));
const byLen = { 3: [], 4: [], 5: [], 6: [], 7: [] };
for (const w of pool) byLen[w.length].push(w);
const byContains = {};
for (const w of pool) {
  const seen = new Set();
  for (const ch of w) if (!seen.has(ch)) { seen.add(ch); (byContains[ch] || (byContains[ch] = [])).push(w); }
}

function fnv1a(str) { let h = 0x811c9dc5; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); } return h >>> 0; }
function mulberry32(a) { return function () { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const makeRng = (s) => mulberry32(fnv1a(s));
const ri = (rng, n) => Math.floor(rng() * n);
const pick = (rng, arr) => arr[ri(rng, arr.length)];

const emptyBoard = () => Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
const inb = (r, c) => r >= 0 && r < SIZE && c >= 0 && c < SIZE;
function cellsFor(word, r, c, dir) { const out = []; for (let i = 0; i < word.length; i++) out.push(dir === "H" ? [r, c + i] : [r + i, c]); return out; }

function canPlace(board, word, r, c, dir, requireCross) {
  const cells = cellsFor(word, r, c, dir);
  for (const [rr, cc] of cells) if (!inb(rr, cc)) return null;
  const [br, bc] = dir === "H" ? [r, c - 1] : [r - 1, c];
  const [ar, ac] = dir === "H" ? [r, c + word.length] : [r + word.length, c];
  if (inb(br, bc) && board[br][bc]) return null; // no extension before
  if (inb(ar, ac) && board[ar][ac]) return null; // no extension after
  let crosses = 0;
  for (let i = 0; i < word.length; i++) {
    const [rr, cc] = cells[i];
    const existing = board[rr][cc];
    if (existing) {
      if (existing !== word[i]) return null;
      crosses++;
    } else {
      const perp = dir === "H" ? [[rr - 1, cc], [rr + 1, cc]] : [[rr, cc - 1], [rr, cc + 1]];
      for (const [pr, pc] of perp) if (inb(pr, pc) && board[pr][pc]) return null; // no side adjacency
    }
  }
  if (requireCross && crosses < 1) return null;
  if (crosses === word.length) return null; // adds no new tile
  return cells;
}

function placeWord(board, word, r, c, dir) { const cells = cellsFor(word, r, c, dir); for (let i = 0; i < word.length; i++) { const [rr, cc] = cells[i]; board[rr][cc] = word[i]; } }

function drawRack(rng) {
  for (let t = 0; t < 60; t++) {
    const b = [];
    for (const [ch, n] of Object.entries(BAG)) for (let i = 0; i < n; i++) b.push(ch);
    const rack = [];
    for (let i = 0; i < RACK_SIZE; i++) { const j = ri(rng, b.length); rack.push(b[j]); b.splice(j, 1); }
    const vc = rack.filter((x) => VOWELS.has(x)).length;
    if (vc >= 2 && vc <= 5) return rack;
  }
  return ["a", "e", "i", "o", "r", "s", "t", "n"];
}

function genDay(seedStr) {
  for (let attempt = 0; attempt < 60; attempt++) {
    const rng = makeRng(seedStr + "#" + attempt);
    const board = emptyBoard();
    const placed = [];
    const L1 = 4 + ri(rng, 3); // 4..6
    const w1 = pick(rng, byLen[L1]);
    const r1 = 3 + ri(rng, 3); // rows 3..5
    const c1 = 1 + ri(rng, SIZE - L1 - 1);
    if (!canPlace(board, w1, r1, c1, "H", false)) continue;
    placeWord(board, w1, r1, c1, "H");
    placed.push({ w: w1, r: r1, c: c1, dir: "H" });

    const target = 2 + (rng() < 0.6 ? 1 : 0);
    let tries = 0;
    while (placed.length < target && tries < 600) {
      tries++;
      const base = pick(rng, placed);
      const bcells = cellsFor(base.w, base.r, base.c, base.dir);
      const [cr, cc] = bcells[ri(rng, bcells.length)];
      const letter = board[cr][cc];
      const newDir = base.dir === "H" ? "V" : "H";
      const cand = byContains[letter];
      if (!cand || !cand.length) continue;
      const word = pick(rng, cand);
      const positions = [];
      for (let q = 0; q < word.length; q++) if (word[q] === letter) positions.push(q);
      const q = pick(rng, positions);
      const [wr, wc] = newDir === "V" ? [cr - q, cc] : [cr, cc - q];
      if (canPlace(board, word, wr, wc, newDir, true)) {
        placeWord(board, word, wr, wc, newDir);
        placed.push({ w: word, r: wr, c: wc, dir: newDir });
      }
    }
    if (placed.length >= 2) return { size: SIZE, words: placed, rack: drawRack(rng), _board: board };
  }
  return null;
}

function ascii(board) {
  let out = "";
  for (let r = 0; r < SIZE; r++) { let line = ""; for (let c = 0; c < SIZE; c++) line += (board[r][c] || ".") + " "; out += line + "\n"; }
  return out;
}

const fmt = (d) => d.toISOString().slice(0, 10);
let d = new Date(START + "T00:00:00Z");
const rows = [];
let failures = 0;
for (let i = 0; i < DAYS; i++) {
  const date = fmt(d);
  const puz = genDay(date);
  if (!puz) { failures++; console.error("FAILED", date); }
  else rows.push({ date, puz });
  d = new Date(d.getTime() + 86400000);
}

let sql = "";
for (const { date, puz } of rows) {
  const { _board, ...clean } = puz;
  const j = JSON.stringify(clean).replace(/'/g, "''");
  sql += `INSERT OR REPLACE INTO puzzles (puzzle_date, data) VALUES ('${date}', '${j}');\n`;
}
fs.writeFileSync(outPath, sql);

console.error(`Generated ${rows.length} puzzles, ${failures} failures -> ${outPath}`);
for (const { date, puz } of rows.slice(0, 3)) {
  console.error(`\n=== ${date} ===  words: ${puz.words.map((x) => x.w).join(", ")}`);
  console.error("rack: " + puz.rack.join(" ").toUpperCase());
  console.error(ascii(puz._board));
}
