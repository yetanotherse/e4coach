import { describe, it, expect } from 'vitest';
import { engineSetOptions } from './uciProcess.js';

describe('engineSetOptions', () => {
  it('interpolates the configured Threads and Hash and pins Chess960 off', () => {
    expect(engineSetOptions(4, 256)).toEqual([
      'setoption name Threads value 4',
      'setoption name Hash value 256',
      'setoption name UCI_Chess960 value false',
    ]);
  });

  it('defaults (1, 16) match the legacy deterministic settings', () => {
    expect(engineSetOptions(1, 16)).toEqual([
      'setoption name Threads value 1',
      'setoption name Hash value 16',
      'setoption name UCI_Chess960 value false',
    ]);
  });
});
