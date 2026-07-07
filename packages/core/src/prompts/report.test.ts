import { describe, it, expect } from 'vitest';
import { buildReportMessages, mergeLlmReport, LlmReportSchema } from './report.js';
import { aggregateProfile } from '../analysis/aggregate.js';
import { makeGame, moveWith } from '../test/factories.js';
import type { GameContext } from '../detectors/types.js';

function profileWithHanging() {
  const ctx: GameContext = {
    game: makeGame({ id: 'g1' }),
    moves: [moveWith('blunder', { userMaterialLossNextPly: 5, cpl: 500, bestMove: 'a1a2' })],
  };
  return aggregateProfile({
    username: 'mockuser',
    source: 'lichess',
    contexts: [ctx],
    movesScored: 20,
    engineMeta: { kind: 'native', movetimeMs: 150 },
  });
}

describe('report prompt', () => {
  it('builds grounded messages that contain only provided facts (no PGN)', () => {
    const messages = buildReportMessages(profileWithHanging());
    expect(messages[0]!.role).toBe('system');
    expect(messages[0]!.content).toMatch(/NEVER invent/);
    const user = messages[1]!.content;
    expect(user).toContain('HANGING_PIECE');
    expect(user).not.toContain('1. e4'); // no raw PGN leaks to the model
  });

  it('merges LLM prose but keeps example positions from the profile', () => {
    const profile = profileWithHanging();
    const llm = LlmReportSchema.parse({
      headline: 'LLM headline',
      intro: 'LLM intro',
      weaknesses: [
        { category: 'HANGING_PIECE', explanation: 'LLM explanation', recommendation: 'LLM rec' },
      ],
    });
    const content = mergeLlmReport(profile, llm);
    expect(content.degraded).toBe(false);
    expect(content.headline).toBe('LLM headline');
    const section = content.weaknesses.find((w) => w.category === 'HANGING_PIECE')!;
    expect(section.explanation).toBe('LLM explanation');
    // Examples come from the profile, never the model.
    expect(section.examples.length).toBeGreaterThan(0);
    expect(section.examples[0]!.fen).toBeTruthy();
  });
});
