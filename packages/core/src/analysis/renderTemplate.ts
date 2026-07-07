/**
 * Deterministic report rendering from a WeaknessProfile (spec §11.4 graceful
 * degradation). Produces a complete, correct ReportContent with NO LLM — used
 * as the fallback when the LLM is unavailable, and as the grounded skeleton the
 * LLM later rephrases. Never invents facts: all prose comes from the fixed
 * category templates + the profile's own numbers.
 */
import type { WeaknessProfile, WeaknessCategoryStat } from '../profile.js';
import type { ReportContent, ReportWeaknessSection } from '../report.js';
import { CATEGORY_META } from '../taxonomy.js';

function sectionFor(stat: WeaknessCategoryStat): ReportWeaknessSection {
  const meta = CATEGORY_META[stat.category];
  return {
    category: stat.category,
    title: meta.displayName,
    explanation: `${meta.description} We saw this ${stat.frequency} time${
      stat.frequency === 1 ? '' : 's'
    } across your games, costing an estimated ${stat.estimatedRatingLoss} rating points.`,
    recommendation: recommendationFor(stat.category),
    examples: stat.examples,
  };
}

const RECOMMENDATIONS: Record<string, string> = {
  HANGING_PIECE:
    'Before every move, do a one-second scan: "What can my opponent capture for free?"',
  MISSED_TACTIC:
    'Spend two weeks on daily tactics puzzles focused on forks, pins, and discovered attacks.',
  OPENING_INACCURACY:
    'Pick one opening for White and one for each main reply as Black, and learn the first 8–10 moves cold.',
  FAILED_CONVERSION:
    'When clearly winning, simplify: trade pieces (not pawns) and eliminate counterplay before pushing.',
  WEAK_DEFENSE:
    'When worse, look for the most resilient move and set problems for your opponent instead of resigning yourself to it.',
  ENDGAME_TECHNIQUE:
    'Study the essential endgames: king-and-pawn, rook endings, and basic checkmates.',
  TIME_TROUBLE:
    'Budget your clock: play the opening quickly and save time for critical middlegame decisions.',
  POSITIONAL_DRIFT:
    'Improve your worst-placed piece each move and keep a concrete plan rather than drifting.',
};

function recommendationFor(category: string): string {
  return RECOMMENDATIONS[category] ?? 'Review these positions and the engine’s suggested moves.';
}

/**
 * Build a full ReportContent from the profile alone. `degraded` marks that this
 * came from the template path (no LLM prose).
 */
export function renderReportTemplate(profile: WeaknessProfile): ReportContent {
  const topStats = profile.topWeaknesses
    .map((cat) => profile.categories.find((c) => c.category === cat))
    .filter((c): c is WeaknessCategoryStat => Boolean(c));

  const weaknesses = topStats.map(sectionFor);

  return {
    headline:
      weaknesses.length > 0
        ? `Your biggest opportunity: ${weaknesses[0]!.title.toLowerCase()}.`
        : 'No clear recurring weaknesses in this sample — keep playing and re-analyze.',
    intro: `We analyzed ${profile.gamesAnalyzed} of your recent games (${profile.movesScored} of your moves) and found the patterns costing you the most rating.`,
    weaknesses,
    ...(profile.lowConfidence
      ? {
          confidenceNote:
            'This is based on a small sample of games, so treat it as a first read — analyze more games for a sharper picture.',
        }
      : {}),
    degraded: true,
  };
}
