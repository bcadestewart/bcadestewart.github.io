const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const VALUES = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 };
const MATE = 100000;

export function starting() {
  return fromFen(START);
}

export function fromFen(fen) {
  const parts = fen.trim().split(/\s+/);
  const ranks = parts[0].split("/");
  if (ranks.length !== 8) throw new Error("FEN needs 8 ranks");
  const sq = Array(64).fill(null);
  ranks.forEach((rank, rankFromTop) => {
    let file = 0;
    for (const symbol of rank) {
      if (symbol >= "1" && symbol <= "8") {
        file += Number(symbol);
        continue;
      }
      const side = symbol === symbol.toUpperCase() ? "w" : "b";
      sq[(7 - rankFromTop) * 8 + file] = { side, type: symbol.toLowerCase() };
      file += 1;
    }
    if (file !== 8) throw new Error("FEN rank does not fill 8 files");
  });
  const castle = parts[2] || "-";
  return {
    sq,
    turn: parts[1] === "b" ? "b" : "w",
    castle: {
      K: castle.includes("K"),
      Q: castle.includes("Q"),
      k: castle.includes("k"),
      q: castle.includes("q"),
    },
    ep: parts[3] && parts[3] !== "-" ? squareIndex(parts[3]) : -1,
    half: Number(parts[4] || 0),
    full: Number(parts[5] || 1),
  };
}

export function toFen(state) {
  return `${placement(state)} ${state.turn} ${castleString(state)} ${state.ep < 0 ? "-" : squareName(state.ep)} ${state.half} ${state.full}`;
}

export function positionKey(state) {
  return toFen(state).split(" ").slice(0, 4).join(" ");
}

export function squareIndex(name) {
  return (name.charCodeAt(1) - 49) * 8 + (name.charCodeAt(0) - 97);
}

export function squareName(square) {
  return String.fromCharCode(97 + (square & 7), 49 + (square >> 3));
}

export function inCheck(state) {
  const king = kingSquare(state, state.turn);
  return king >= 0 && attacked(state, king, opposite(state.turn));
}

export function legalMoves(state) {
  const moves = [];
  for (const move of pseudoMoves(state)) {
    const next = apply(state, move);
    const king = kingSquare(next, state.turn);
    if (king >= 0 && !attacked(next, king, next.turn)) moves.push(move);
  }
  return moves;
}

export function apply(state, move) {
  const next = clone(state);
  const moving = next.sq[move.from];
  const capture = move.ep || next.sq[move.to] != null;
  next.sq[move.from] = null;
  if (move.ep) {
    const captured = move.to + (state.turn === "w" ? -8 : 8);
    next.sq[captured] = null;
  }
  if (move.castle) {
    const kingside = (move.to & 7) === 6;
    const rank = move.from & ~7;
    const rookFrom = rank + (kingside ? 7 : 0);
    const rookTo = rank + (kingside ? 5 : 3);
    next.sq[rookTo] = next.sq[rookFrom];
    next.sq[rookFrom] = null;
  }
  next.sq[move.to] = move.promo ? { side: moving.side, type: move.promo } : moving;
  next.ep = -1;
  if (moving.type === "p" && Math.abs(move.to - move.from) === 16) {
    next.ep = (move.from + move.to) / 2;
  }
  dropCastle(next, move.from, move.to);
  next.half = moving.type === "p" || capture ? 0 : state.half + 1;
  if (state.turn === "b") next.full = state.full + 1;
  next.turn = opposite(state.turn);
  return next;
}

export function outcome(state, history) {
  if (state.half >= 100) return "fifty-move";
  if (history && history.filter((key) => key === positionKey(state)).length >= 3) return "repetition";
  const moves = legalMoves(state);
  if (moves.length === 0) return inCheck(state) ? "checkmate" : "stalemate";
  return inCheck(state) ? "check" : "playing";
}

export function choose(state, depth = 3) {
  let best = null;
  let bestScore = -Infinity;
  let alpha = -Infinity;
  for (const move of ordered(state, legalMoves(state))) {
    const score = -negamax(apply(state, move), depth - 1, -Infinity, -alpha);
    if (score > bestScore) {
      bestScore = score;
      best = move;
      alpha = score;
    }
  }
  return best;
}

export function perft(state, depth) {
  if (depth === 0) return 1;
  let count = 0;
  for (const move of legalMoves(state)) count += perft(apply(state, move), depth - 1);
  return count;
}

function negamax(state, depthLeft, alpha, beta) {
  if (depthLeft === 0) return evaluate(state);
  const moves = legalMoves(state);
  if (moves.length === 0) return inCheck(state) ? -MATE - depthLeft : 0;
  for (const move of ordered(state, moves)) {
    const score = -negamax(apply(state, move), depthLeft - 1, -beta, -alpha);
    if (score >= beta) return beta;
    if (score > alpha) alpha = score;
  }
  return alpha;
}

function evaluate(state) {
  let score = 0;
  for (let square = 0; square < 64; square += 1) {
    const piece = state.sq[square];
    if (!piece) continue;
    const sign = piece.side === "w" ? 1 : -1;
    score += sign * (VALUES[piece.type] + placementBonus(piece, square));
  }
  return state.turn === "w" ? score : -score;
}

function placementBonus(piece, square) {
  const file = square & 7;
  const rank = piece.side === "w" ? square >> 3 : 7 - (square >> 3);
  const center = 3.5 - Math.abs(file - 3.5) + (3.5 - Math.abs(rank - 3.5));
  if (piece.type === "p") return rank * 4 + center;
  if (piece.type === "n" || piece.type === "b") return center * 3;
  return 0;
}

function ordered(state, moves) {
  return moves.slice().sort((a, b) => scoreMove(state, b) - scoreMove(state, a));
}

function scoreMove(state, move) {
  const victim = state.sq[move.to];
  let score = move.promo ? 800 : 0;
  if (victim) score += VALUES[victim.type] - VALUES[state.sq[move.from].type] / 10;
  if (move.ep) score += 100;
  return score;
}

function pseudoMoves(state) {
  const moves = [];
  for (let from = 0; from < 64; from += 1) {
    const piece = state.sq[from];
    if (!piece || piece.side !== state.turn) continue;
    if (piece.type === "p") pawnMoves(state, moves, from);
    else if (piece.type === "n") leap(state, moves, from, KNIGHT);
    else if (piece.type === "b") slide(state, moves, from, DIAGONAL);
    else if (piece.type === "r") slide(state, moves, from, ORTHOGONAL);
    else if (piece.type === "q") slide(state, moves, from, ORTHOGONAL.concat(DIAGONAL));
    else kingMoves(state, moves, from);
  }
  return moves;
}

function pawnMoves(state, moves, from) {
  const dir = state.turn === "w" ? 8 : -8;
  const startRank = state.turn === "w" ? 1 : 6;
  const forward = from + dir;
  if (onBoard(forward) && !state.sq[forward]) {
    addPawn(state, moves, from, forward);
    if ((from >> 3) === startRank && !state.sq[from + dir * 2]) {
      moves.push(quiet(from, from + dir * 2));
    }
  }
  for (const fileDelta of [-1, 1]) {
    if (!sameFileSpan(from, fileDelta)) continue;
    const to = from + dir + fileDelta;
    if (!onBoard(to)) continue;
    const target = state.sq[to];
    if (target && target.side !== state.turn) addPawn(state, moves, from, to);
    else if (to === state.ep) moves.push({ from, to, promo: null, castle: false, ep: true });
  }
}

function addPawn(state, moves, from, to) {
  const last = state.turn === "w" ? 7 : 0;
  if ((to >> 3) !== last) {
    moves.push(quiet(from, to));
    return;
  }
  for (const promo of ["q", "r", "b", "n"]) {
    moves.push({ from, to, promo, castle: false, ep: false });
  }
}

const ORTHOGONAL = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const DIAGONAL = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const KNIGHT = [[1, 2], [1, -2], [-1, 2], [-1, -2], [2, 1], [2, -1], [-2, 1], [-2, -1]];

function leap(state, moves, from, deltas) {
  const file = from & 7;
  const rank = from >> 3;
  for (const [fileDelta, rankDelta] of deltas) {
    const nextFile = file + fileDelta;
    const nextRank = rank + rankDelta;
    if (nextFile < 0 || nextFile > 7 || nextRank < 0 || nextRank > 7) continue;
    addQuietOrCapture(state, moves, from, nextRank * 8 + nextFile);
  }
}

function slide(state, moves, from, deltas) {
  const file = from & 7;
  const rank = from >> 3;
  for (const [fileStep, rankStep] of deltas) {
    let nextFile = file;
    let nextRank = rank;
    while (true) {
      nextFile += fileStep;
      nextRank += rankStep;
      if (nextFile < 0 || nextFile > 7 || nextRank < 0 || nextRank > 7) break;
      const to = nextRank * 8 + nextFile;
      const target = state.sq[to];
      if (!target) {
        moves.push(quiet(from, to));
        continue;
      }
      if (target.side !== state.turn) moves.push(quiet(from, to));
      break;
    }
  }
}

function kingMoves(state, moves, from) {
  leap(state, moves, from, ORTHOGONAL.concat(DIAGONAL));
  if (inCheck(state) || (from & 7) !== 4) return;
  const home = state.turn === "w" ? 0 : 7;
  if ((from >> 3) !== home) return;
  const enemy = opposite(state.turn);
  const rights = state.castle;
  const kingside = state.turn === "w" ? rights.K : rights.k;
  const queenside = state.turn === "w" ? rights.Q : rights.q;
  if (kingside && isRook(state, from + 3) && !state.sq[from + 1] && !state.sq[from + 2]
      && !attacked(state, from + 1, enemy)) {
    moves.push({ from, to: from + 2, promo: null, castle: true, ep: false });
  }
  if (queenside && isRook(state, from - 4) && !state.sq[from - 1] && !state.sq[from - 2] && !state.sq[from - 3]
      && !attacked(state, from - 1, enemy)) {
    moves.push({ from, to: from - 2, promo: null, castle: true, ep: false });
  }
}

function attacked(state, square, by) {
  return pawnAttack(state, square, by) || knightAttack(state, square, by) || kingAttack(state, square, by)
    || rayAttack(state, square, by, true) || rayAttack(state, square, by, false);
}

function pawnAttack(state, square, by) {
  const rank = (square >> 3) + (by === "w" ? -1 : 1);
  const file = square & 7;
  if (rank < 0 || rank > 7) return false;
  return (file > 0 && isPiece(state, rank * 8 + file - 1, by, "p"))
    || (file < 7 && isPiece(state, rank * 8 + file + 1, by, "p"));
}

function knightAttack(state, square, by) {
  const file = square & 7;
  const rank = square >> 3;
  for (const [fileDelta, rankDelta] of [[1, 2], [2, 1]]) {
    for (const signs of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const nextFile = file + fileDelta * signs[0];
      const nextRank = rank + rankDelta * signs[1];
      if (nextFile < 0 || nextFile > 7 || nextRank < 0 || nextRank > 7) continue;
      if (isPiece(state, nextRank * 8 + nextFile, by, "n")) return true;
    }
  }
  return false;
}

function kingAttack(state, square, by) {
  const file = square & 7;
  const rank = square >> 3;
  for (let fileDelta = -1; fileDelta <= 1; fileDelta += 1) {
    for (let rankDelta = -1; rankDelta <= 1; rankDelta += 1) {
      if (fileDelta === 0 && rankDelta === 0) continue;
      const nextFile = file + fileDelta;
      const nextRank = rank + rankDelta;
      if (nextFile < 0 || nextFile > 7 || nextRank < 0 || nextRank > 7) continue;
      if (isPiece(state, nextRank * 8 + nextFile, by, "k")) return true;
    }
  }
  return false;
}

function rayAttack(state, square, by, diagonal) {
  const file = square & 7;
  const rank = square >> 3;
  const steps = diagonal ? [[1, 1], [1, -1], [-1, 1], [-1, -1]] : [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const matcher = diagonal ? ["b", "q"] : ["r", "q"];
  for (const [fileStep, rankStep] of steps) {
    let nextFile = file;
    let nextRank = rank;
    while (true) {
      nextFile += fileStep;
      nextRank += rankStep;
      if (nextFile < 0 || nextFile > 7 || nextRank < 0 || nextRank > 7) break;
      const piece = state.sq[nextRank * 8 + nextFile];
      if (!piece) continue;
      if (piece.side === by && matcher.includes(piece.type)) return true;
      break;
    }
  }
  return false;
}

function dropCastle(state, from, to) {
  const rights = state.castle;
  if (from === 4 || to === 4) {
    rights.K = false;
    rights.Q = false;
  }
  if (from === 0 || to === 0) rights.Q = false;
  if (from === 7 || to === 7) rights.K = false;
  if (from === 60 || to === 60) {
    rights.k = false;
    rights.q = false;
  }
  if (from === 56 || to === 56) rights.q = false;
  if (from === 63 || to === 63) rights.k = false;
}

function clone(state) {
  return {
    sq: state.sq.slice(),
    turn: state.turn,
    castle: { ...state.castle },
    ep: state.ep,
    half: state.half,
    full: state.full,
  };
}

function placement(state) {
  const ranks = [];
  for (let rank = 7; rank >= 0; rank -= 1) {
    let empty = 0;
    let text = "";
    for (let file = 0; file < 8; file += 1) {
      const piece = state.sq[rank * 8 + file];
      if (!piece) {
        empty += 1;
        continue;
      }
      if (empty) {
        text += empty;
        empty = 0;
      }
      const symbol = piece.type;
      text += piece.side === "w" ? symbol.toUpperCase() : symbol;
    }
    if (empty) text += empty;
    ranks.push(text);
  }
  return ranks.join("/");
}

function castleString(state) {
  const text = `${state.castle.K ? "K" : ""}${state.castle.Q ? "Q" : ""}${state.castle.k ? "k" : ""}${state.castle.q ? "q" : ""}`;
  return text || "-";
}

function kingSquare(state, side) {
  return state.sq.findIndex((piece) => piece && piece.side === side && piece.type === "k");
}

function isRook(state, square) {
  const piece = state.sq[square];
  return piece && piece.side === state.turn && piece.type === "r";
}

function isPiece(state, square, side, type) {
  const piece = state.sq[square];
  return piece && piece.side === side && piece.type === type;
}

function addQuietOrCapture(state, moves, from, to) {
  const target = state.sq[to];
  if (!target || target.side !== state.turn) moves.push(quiet(from, to));
}

function quiet(from, to) {
  return { from, to, promo: null, castle: false, ep: false };
}

function sameFileSpan(from, fileDelta) {
  const file = (from & 7) + fileDelta;
  return file >= 0 && file <= 7;
}

function onBoard(square) {
  return square >= 0 && square < 64;
}

function opposite(side) {
  return side === "w" ? "b" : "w";
}
