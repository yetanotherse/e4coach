import { describe, it, expect } from 'vitest';
import { parsePgnUpload, splitPgnGames } from './pgnUpload.js';

const GAME_A = `[Event "Rated Blitz game"]
[Site "https://lichess.org/abcd1234"]
[White "Alice"]
[Black "Bob"]
[Result "1-0"]
[TimeControl "300+0"]
[Variant "Standard"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Bxc6 dxc6 1-0`;

const GAME_B = `[Event "Club Rapid"]
[White "Carol"]
[Black "Dave"]
[Result "0-1"]
[TimeControl "600+5"]
[Variant "Standard"]

1. d4 d5 2. c4 e6 3. Nc3 Nf6 4. Bg5 Be7 0-1`;

// Minimal tag (Event only) + bare movetext, no result token, no TimeControl.
const MINIMAL_TAG = `[Event "Round 3"]

1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6`;

// A tagged game that ends in checkmate (no explicit result token).
const MATE_GAME = `[Event "Blitz"]

1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7#`;

// Non-standard variant — skipped.
const VARIANT = `[Event "Crazyhouse"]
[Variant "Crazyhouse"]

1. e4 e5 2. Nf3 Nc6 1-0`;

describe('splitPgnGames', () => {
  it('splits games that share a single line (newlines stripped)', () => {
    const oneLine = '[Event "a"]1. e4 e5 2. Nf3 Nc6 [Event "b"]1. d4 d5 2. c4 e6';
    const blocks = splitPgnGames(oneLine);
    expect(blocks).toHaveLength(2);
  });

  it('keeps whitespace-separated header tags in the same game', () => {
    const blocks = splitPgnGames(GAME_A);
    expect(blocks).toHaveLength(1);
  });

  it('returns nothing when there are no tags', () => {
    expect(splitPgnGames('1. e4 c5 2. Nf3 d6 3. d4 cxd4')).toHaveLength(0);
  });
});

describe('parsePgnUpload', () => {
  it('parses multiple tagged games and normalizes metadata', () => {
    const { games, detectedGames, skipped, truncated } = parsePgnUpload(
      [GAME_A, GAME_B].join('\n\n'),
      { max: 25 },
    );
    expect(games).toHaveLength(2);
    expect(detectedGames).toBe(2);
    expect(skipped).toBe(0);
    expect(truncated).toBe(0);

    const a = games[0]!;
    expect(a.white).toBe('Alice');
    expect(a.black).toBe('Bob');
    expect(a.event).toBe('Rated Blitz game');
    expect(a.result).toBe('1-0');
    expect(a.timeControl).toBe('300+0');
    expect(a.speedGuess).toBe('blitz');
    expect(a.plyCount).toBe(8);
    expect(a.id).toMatch(/^pgn-/);

    expect(games[1]!.speedGuess).toBe('rapid');
  });

  it('parses games crammed onto one line (stripped newlines)', () => {
    const oneLine =
      '[Event "a"]1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 [Event "b"]1. d4 d5 2. c4 e6 3. Nc3 Nf6';
    const { games, detectedGames } = parsePgnUpload(oneLine, { max: 25 });
    expect(detectedGames).toBe(2);
    expect(games).toHaveLength(2);
  });

  it('imports a minimal-tag game (Event only, no result/time control)', () => {
    const { games } = parsePgnUpload(MINIMAL_TAG, { max: 25 });
    expect(games).toHaveLength(1);
    expect(games[0]!.event).toBe('Round 3');
    expect(games[0]!.result).toBe('*');
    expect(games[0]!.timeControl).toBe('unknown');
    expect(games[0]!.speedGuess).toBeUndefined();
    expect(games[0]!.white).toBe('White');
  });

  it('imports a game that ends in checkmate', () => {
    const { games } = parsePgnUpload(MATE_GAME, { max: 25 });
    expect(games).toHaveLength(1);
    expect(games[0]!.plyCount).toBe(7);
  });

  it('reports zero detected games for fully tagless input', () => {
    const tagless = [
      '1. e4 c5 2. Nf3 g6 3. d4 cxd4 4. Nxd4 Nc6 5. c4 Nf6 6. Nc3 d6',
      '1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 Nc6 6. Bc4 Qb6',
    ].join('\n\n');
    const { games, detectedGames } = parsePgnUpload(tagless, { max: 25 });
    expect(detectedGames).toBe(0);
    expect(games).toHaveLength(0);
  });

  it('skips leading orphan movetext but imports the tagged game after it', () => {
    const mixed = `1. e4 e5 2. Nf3 Nc6 3. Bb5\n\n${GAME_A}`;
    const { games, detectedGames } = parsePgnUpload(mixed, { max: 25 });
    // Only the tagged game is detected; the orphan prefix carries no tag.
    expect(detectedGames).toBe(1);
    expect(games).toHaveLength(1);
    expect(games[0]!.white).toBe('Alice');
  });

  it('skips non-standard variants', () => {
    const { games, skipped } = parsePgnUpload([GAME_A, VARIANT].join('\n\n'), { max: 25 });
    expect(games).toHaveLength(1);
    expect(skipped).toBe(1);
  });

  it('dedups identical games', () => {
    const { games } = parsePgnUpload([GAME_A, GAME_A].join('\n\n'), { max: 25 });
    expect(games).toHaveLength(1);
  });

  it('takes the first N and counts the rest as truncated', () => {
    const many = Array.from({ length: 30 }, (_, i) =>
      GAME_A.replace('a6 4. Bxc6 dxc6', `a6 4. Ba4 Nf6 ${i + 5}. O-O Be7`),
    ).join('\n\n');
    const { games, truncated } = parsePgnUpload(many, { max: 25 });
    expect(games).toHaveLength(25);
    expect(truncated).toBe(5);
  });
});
