import { describe, it, expect } from 'vitest';
import { parseLichessStudies, speedFromTimeControl, splitChapters } from './studies.js';

// A game where the user (myname) is White — importable.
const WHITE_GAME = `[Event "Rated Blitz game"]
[Site "https://lichess.org/abcd1234"]
[White "MyName"]
[Black "Opponent"]
[Result "1-0"]
[TimeControl "300+0"]
[Variant "Standard"]
[ChapterURL "https://lichess.org/study/AAAA/bbbb"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Bxc6 dxc6 1-0`;

// A game where the user is Black — importable, userColor black.
const BLACK_GAME = `[Event "Rated Rapid game"]
[Site "https://lichess.org/efgh5678"]
[White "Opponent"]
[Black "myname"]
[Result "0-1"]
[TimeControl "600+5"]
[Variant "Standard"]

1. d4 d5 2. c4 e6 3. Nc3 Nf6 4. Bg5 Be7 0-1`;

// Hand-built opening tree — no White/Black → skipped.
const NO_PLAYERS = `[Event "Opening study: Chapter 1"]
[Result "*"]
[Variant "Standard"]
[ChapterURL "https://lichess.org/study/CCCC/dddd"]

1. e4 c5 2. Nf3 d6 *`;

// A game with players but the user matches neither → skipped.
const OTHER_PLAYERS = `[Event "Rated Blitz game"]
[Site "https://lichess.org/ijkl9012"]
[White "Alice"]
[Black "Bob"]
[Result "1-0"]
[TimeControl "180+0"]
[Variant "Standard"]

1. e4 e5 2. Nf3 Nc6 1-0`;

// Non-standard variant → skipped even though the user is White.
const VARIANT = `[Event "Rated Crazyhouse game"]
[White "MyName"]
[Black "Opponent"]
[Result "1-0"]
[TimeControl "300+0"]
[Variant "Crazyhouse"]

1. e4 e5 2. Nf3 Nc6 1-0`;

// An OTB import: real names (not the username), but Orientation is set → import.
const ORIENTED_BLACK = `[Event "OTB Tournament"]
[Site "India"]
[White "Real Name"]
[Black "Other Person"]
[Result "1-0"]
[Variant "Standard"]
[Orientation "black"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 1-0`;

const ALL = [WHITE_GAME, BLACK_GAME, NO_PLAYERS, OTHER_PLAYERS, VARIANT].join('\n\n');

describe('splitChapters', () => {
  it('splits a multi-game PGN on the Event boundary', () => {
    expect(splitChapters(ALL)).toHaveLength(5);
  });
});

describe('speedFromTimeControl', () => {
  it('classifies by estimated duration (initial + 40*inc)', () => {
    expect(speedFromTimeControl('15+0')).toBe('ultrabullet');
    expect(speedFromTimeControl('60+0')).toBe('bullet');
    expect(speedFromTimeControl('300+0')).toBe('blitz');
    expect(speedFromTimeControl('600+5')).toBe('rapid'); // 600+200=800
    expect(speedFromTimeControl('1800+0')).toBe('classical');
    expect(speedFromTimeControl(undefined)).toBeUndefined();
    expect(speedFromTimeControl('-')).toBeUndefined();
  });
});

describe('parseLichessStudies', () => {
  it('imports only attributable standard games and sets userColor', () => {
    const { games, skipped } = parseLichessStudies(ALL, { username: 'myname', max: 100 });
    expect(games).toHaveLength(2);
    expect(skipped).toBe(3); // no-players, other-players, variant
    const white = games.find((g) => g.id === 'abcd1234')!;
    const black = games.find((g) => g.id === 'efgh5678')!;
    expect(white.userColor).toBe('white');
    expect(white.speed).toBe('blitz');
    expect(black.userColor).toBe('black');
    expect(black.speed).toBe('rapid');
  });

  it('applies a time-control filter', () => {
    const { games } = parseLichessStudies(ALL, {
      username: 'myname',
      perfTypes: ['rapid'],
      max: 100,
    });
    expect(games).toHaveLength(1);
    expect(games[0]!.speed).toBe('rapid');
  });

  it('honors the import cap', () => {
    const { games, skipped } = parseLichessStudies(ALL, { username: 'myname', max: 1 });
    expect(games).toHaveLength(1);
    expect(skipped).toBe(4);
  });

  it('returns zero games when nothing is attributable', () => {
    const { games } = parseLichessStudies([NO_PLAYERS, OTHER_PLAYERS].join('\n\n'), {
      username: 'myname',
      max: 100,
    });
    expect(games).toHaveLength(0);
  });

  it('uses the Orientation tag when player names do not match the username', () => {
    // Real names (OTB import), username matches neither — Orientation drives it.
    const { games } = parseLichessStudies(ORIENTED_BLACK, { username: 'myname', max: 100 });
    expect(games).toHaveLength(1);
    expect(games[0]!.userColor).toBe('black');
  });

  it('Orientation takes precedence over a username match', () => {
    const conflict = WHITE_GAME.replace('[Result "1-0"]', '[Result "1-0"]\n[Orientation "black"]');
    const { games } = parseLichessStudies(conflict, { username: 'myname', max: 100 });
    expect(games[0]!.userColor).toBe('black'); // orientation wins over White="MyName"
  });
});
