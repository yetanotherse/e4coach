/**
 * Deterministic canned games for the MockGameSource. Real, short, legal PGNs
 * so the full pipeline (parse → evaluate → classify) exercises real chess logic
 * without any network or engine. Kept intentionally small.
 */
import type { ImportedGame } from '@chess-coach/core';

// A short game where White (our user) hangs a piece — exercises HANGING_PIECE.
const HANGING_PIECE_PGN = `[Event "Rated Blitz game"]
[Site "https://lichess.org/mock0001"]
[White "mockuser"]
[Black "opponentA"]
[Result "0-1"]
[ECO "C50"]
[Opening "Italian Game"]
[TimeControl "300+0"]

1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. d3 Nf6 5. Nc3 d6 6. Bg5 h6 7. Bh4 g5
8. Bg3 Bg4 9. h3 Bxf3 10. Qxf3 Nd4 11. Qd1 g4 12. hxg4 Nxg4 0-1`;

// A short game where White drops material in the endgame — ENDGAME_TECHNIQUE.
const ENDGAME_PGN = `[Event "Rated Blitz game"]
[Site "https://lichess.org/mock0002"]
[White "mockuser"]
[Black "opponentB"]
[Result "1/2-1/2"]
[ECO "B10"]
[Opening "Caro-Kann Defense"]
[TimeControl "300+0"]

1. e4 c6 2. d4 d5 3. exd5 cxd5 4. Bd3 Nc6 5. c3 Nf6 6. Bf4 Bg4 7. Qb3 Qd7
8. Nd2 e6 9. Ngf3 Bd6 10. Bxd6 Qxd6 11. O-O O-O 12. Rfe1 Rfe8 1/2-1/2`;

export const MOCK_GAMES: ImportedGame[] = [
  {
    id: 'mock0001',
    pgn: HANGING_PIECE_PGN,
    white: 'mockuser',
    black: 'opponentA',
    userColor: 'white',
    result: '0-1',
    timeControl: '300+0',
    eco: 'C50',
    opening: 'Italian Game',
    playedAt: '2026-07-01T10:00:00.000Z',
  },
  {
    id: 'mock0002',
    pgn: ENDGAME_PGN,
    white: 'mockuser',
    black: 'opponentB',
    userColor: 'white',
    result: '1/2-1/2',
    timeControl: '300+0',
    eco: 'B10',
    opening: 'Caro-Kann Defense',
    playedAt: '2026-07-02T10:00:00.000Z',
  },
];
