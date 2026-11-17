import { apply, fromFen, legalMoves, outcome, perft, starting } from "./engine.mjs";

const cases = [
  ["start depth 1", starting(), 1, 20],
  ["start depth 2", starting(), 2, 400],
  ["start depth 3", starting(), 3, 8902],
  ["kiwipete depth 1", fromFen("r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1"), 1, 48],
  ["kiwipete depth 2", fromFen("r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1"), 2, 2039],
  ["en passant depth 1", fromFen("8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1"), 1, 14],
];

let failed = 0;
for (const [name, state, depth, expected] of cases) {
  const count = perft(state, depth);
  if (count !== expected) {
    failed += 1;
    console.error(`${name}: ${count}, expected ${expected}`);
  }
}

let board = starting();
for (const uci of ["e2e4", "e7e5", "f1c4", "b8c6", "d1h5", "g8f6", "h5f7"]) {
  const move = legalMoves(board).find((item) => uciOf(item) === uci);
  if (!move) throw new Error(`missing ${uci}`);
  board = apply(board, move);
}
if (outcome(board) !== "checkmate") {
  failed += 1;
  console.error(`scholar's mate: ${outcome(board)}`);
}

if (failed) process.exit(1);
console.log(`${cases.length + 1} checks passed`);

function uciOf(move) {
  return `${fileRank(move.from)}${fileRank(move.to)}${move.promo || ""}`;
}

function fileRank(square) {
  return String.fromCharCode(97 + (square & 7), 49 + (square >> 3));
}
