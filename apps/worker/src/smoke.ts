/**
 * Manual smoke test: real Lichess import + real Stockfish analysis, no DB, no
 * LLM. Proves the pipeline works on real data.
 *
 *   STOCKFISH_PATH=/opt/homebrew/bin/stockfish \
 *   pnpm --filter @chess-coach/worker exec tsx src/smoke.ts <lichessUser> [maxGames]
 */
import {
  aggregateProfile,
  parseGame,
  scoreUserMoves,
  renderReportTemplate,
  type GameContext,
} from '@chess-coach/core';
import { LichessGameSource, StockfishNativeEngine } from '@chess-coach/adapters';
import { evaluateGame } from './pipeline/evaluate.js';

async function main(): Promise<void> {
  const username = process.argv[2] ?? 'EricRosen';
  const maxGames = Number(process.argv[3] ?? 2);
  const binPath = process.env.STOCKFISH_PATH ?? '/opt/homebrew/bin/stockfish';
  const movetimeMs = 80;

  console.log(`Importing ${maxGames} games for ${username}…`);
  const source = new LichessGameSource({ userAgent: 'ChessCoachSmoke/0.1' });
  const games = await source.fetchRecentGames(username, { max: maxGames, rated: true });
  console.log(`Fetched ${games.length} games.`);

  const engine = new StockfishNativeEngine({ binPath, poolSize: 2 });
  const contexts: GameContext[] = [];
  let movesScored = 0;
  let evalTotal = 0;

  const started = Date.now();
  for (const game of games) {
    const parsed = parseGame(game);
    const { lookup, evalCount } = await evaluateGame(game, parsed, engine, { movetimeMs });
    evalTotal += evalCount;
    const moves = scoreUserMoves(parsed, lookup);
    movesScored += moves.length;
    contexts.push({ game, moves });
    console.log(`  ${game.id}: ${moves.length} user moves scored (${evalCount} evals)`);
  }
  await engine.dispose();

  const profile = aggregateProfile({
    username,
    source: 'lichess',
    contexts,
    movesScored,
    engineMeta: { kind: 'native', movetimeMs },
  });

  console.log(`\nElapsed: ${((Date.now() - started) / 1000).toFixed(1)}s, ${evalTotal} evals`);
  console.log('\n── Weakness profile ──');
  console.log(`Games: ${profile.gamesAnalyzed}, moves scored: ${profile.movesScored}`);
  console.log('Top weaknesses:', profile.topWeaknesses);
  for (const c of profile.categories) {
    console.log(`  ${c.category}: freq=${c.frequency}, ~${c.estimatedRatingLoss} rating pts`);
  }

  const report = renderReportTemplate(profile);
  console.log('\n── Report (template) ──');
  console.log('Headline:', report.headline);
  for (const w of report.weaknesses) {
    console.log(`\n# ${w.title}`);
    console.log(w.explanation);
    console.log('→', w.recommendation);
    for (const ex of w.examples) {
      console.log(`   e.g. move ${ex.moveNumber}: ${ex.playedMove} (better: ${ex.betterMove}) ${ex.gameUrl ?? ''}`);
    }
  }
}

main().catch((err) => {
  console.error('smoke failed:', err);
  process.exit(1);
});
