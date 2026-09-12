/**
 * Per-mistake narration prompt. Same grounding contract as the report prompt
 * (see ./report.ts): the model ONLY rephrases facts the engine already
 * established — it never invents moves, evaluations, or tactics.
 *
 * The stakes are higher here than for the report prose, because this text sits
 * directly next to a board. A hallucinated move would look authoritative and
 * teach a beginner something false. Zod cannot catch that, so every response is
 * additionally checked against `allowedMoves` by `validateGrounding` before it
 * is allowed anywhere near a report.
 */
import { z } from 'zod';
import type { ExplanationFacts } from '../analysis/explain.js';
import type { LlmMessage } from '../ports/llm.js';

const SYSTEM = `You are a warm, concrete chess coach explaining a single mistake to a club player rated under 1800.

Your reader can see the board and can step through the moves you mention. They often cannot work out WHY a move loses, only that the engine dislikes it. Your job is to make the reason obvious.

STRICT RULES:
- You are given pre-computed engine analysis. Only rephrase and explain those facts.
- NEVER invent moves, evaluations, tactics, or positions.
- You may ONLY mention moves listed in that position's "allowedMoves". Mentioning any other move is a serious error.
- Do not state centipawn numbers. Say "a pawn", "a piece", "winning" in plain words.

HOW TO WRITE:
- whatWentWrong: what the opponent does next and why it hurts. Lead with their move.
- whyBetter: what the engine's move accomplishes — what it defends, escapes, or takes.
- takeaway: one transferable habit, not a fact about this position.
- Second person ("you"), plain language, no jargon dumps. 1-2 sentences each.
- Be encouraging but honest. Never condescending.

Return ONLY JSON matching the schema. Echo each position's "id" exactly.`;

/** Compact, PII-free facts for one mistake. No FENs, no PGNs (spec §11.3). */
function factsFor(f: ExplanationFacts) {
  return {
    id: f.id,
    youPlayed: f.playedSan,
    engineMove: f.bestSan,
    whatTheEngineMoveDoes: f.bestMoveRole,
    ...(f.hangs ? { youLeftHanging: `${f.hangs.piece} on ${f.hangs.square}` } : {}),
    ...(f.refutationMotifs.length ? { tactics: f.refutationMotifs } : {}),
    ...(f.materialSwingPawns !== 0 ? { materialChangeInPawns: f.materialSwingPawns } : {}),
    lines: f.variations.map((v) => ({ kind: v.kind, moves: v.sans.join(' ') })),
    allowedMoves: f.allowedMoves,
  };
}

export function buildExplainMessages(batch: ExplanationFacts[]): LlmMessage[] {
  return [
    { role: 'system', content: SYSTEM },
    {
      role: 'user',
      content: `Explain each of these mistakes. JSON only.\n\n${JSON.stringify(
        batch.map(factsFor),
        null,
        2,
      )}`,
    },
  ];
}

const PUZZLE_SYSTEM = `You are a warm, concrete chess coach explaining a solved puzzle to a club player rated under 1800.

The reader has just FOUND the solution themselves ("engineMove") and often cannot explain WHY it wins, only that it was the answer. Your job is to make the reason obvious.

These positions come from solved DRILLS, so the field meanings differ from a mistake explanation:
- "youPlayed" is the OPPONENT's last move — the one that created this winning chance. Explain what it overlooked or what threat it ignored.
- "engineMove" is the solution the reader found. Say "the solution" or "your move", not "the engine's move".
- "lines" include the official solution line and any engine alternatives.

STRICT RULES:
- You are given pre-computed engine analysis. Only rephrase and explain those facts.
- NEVER invent moves, evaluations, tactics, or positions.
- You may ONLY mention moves listed in that position's "allowedMoves". Mentioning any other move is a serious error.
- Do not state centipawn numbers. Say "a pawn", "a piece", "winning" in plain words.

HOW TO WRITE:
- whatWentWrong: what the opponent's last move overlooked — the threat or loose piece it allowed. Lead with that move.
- whyBetter: what the solution accomplishes — what it wins, attacks, or forces.
- takeaway: one transferable habit, not a fact about this position.
- Second person ("you"), plain language, no jargon dumps. 1-2 sentences each.
- Be encouraging but honest. Never condescending.

Return ONLY JSON matching the schema. Echo each position's "id" exactly.`;

/**
 * Same payload as the mistake prompt, puzzle framing. Shares factsFor so both
 * prompt variants expose identical fields (and thus identical grounding).
 */
export function buildPuzzleExplainMessages(batch: ExplanationFacts[]): LlmMessage[] {
  return [
    { role: 'system', content: PUZZLE_SYSTEM },
    {
      role: 'user',
      content: `Explain each of these solved puzzles. JSON only.\n\n${JSON.stringify(
        batch.map(factsFor),
        null,
        2,
      )}`,
    },
  ];
}

/** JSON schema handed to the provider for structured output. */
export const EXPLAIN_JSON_SCHEMA = {
  type: 'object',
  properties: {
    explanations: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          whatWentWrong: { type: 'string' },
          whyBetter: { type: 'string' },
          takeaway: { type: 'string' },
        },
        required: ['id', 'whatWentWrong', 'whyBetter', 'takeaway'],
      },
    },
  },
  required: ['explanations'],
} as const;

export const LlmExplainSchema = z.object({
  explanations: z
    .array(
      z.object({
        id: z.string().min(1),
        whatWentWrong: z.string().min(1).max(600),
        whyBetter: z.string().min(1).max(600),
        takeaway: z.string().min(1).max(600),
      }),
    )
    .min(1),
});
export type LlmExplain = z.infer<typeof LlmExplainSchema>;
export type LlmExplainItem = LlmExplain['explanations'][number];

/**
 * Matches SAN-looking tokens: piece moves, pawn moves, captures, promotions,
 * and castling, with optional check/mate suffix.
 */
const SAN_TOKEN = /\b(?:O-O-O|O-O|(?:[KQRBN][a-h]?[1-8]?|[a-h])?x?[a-h][1-8](?:=[QRBN])?)[+#]?/g;

/** A bare coordinate like "d5" — ambiguous between a pawn move and a square. */
const BARE_SQUARE = /^[a-h][1-8]$/;

/**
 * Squares the narration is allowed to name directly.
 *
 * Prose naturally refers to squares ("your knight on d5"), and the facts we
 * send actively encourage it. A bare coordinate is indistinguishable from a
 * pawn move by shape alone, so rather than rejecting every square mention (which
 * would discard most well-grounded narration) we accept coordinates that appear
 * in the lines the engine actually produced.
 */
function knownSquares(facts: ExplanationFacts): Set<string> {
  const squares = new Set<string>();
  for (const san of facts.allowedMoves) {
    // The destination is the last coordinate in a SAN, ignoring any promotion
    // piece and check/mate marker. Castling contributes no square.
    const matches = stripSuffix(san).match(/[a-h][1-8]/g);
    const destination = matches?.[matches.length - 1];
    if (destination) squares.add(destination);
  }
  if (facts.hangs) squares.add(facts.hangs.square);
  return squares;
}

/**
 * Reject narration that cites a move the engine never produced.
 *
 * This is the check that makes LLM narration safe to put next to a board: the
 * schema will happily accept a fluent, confident sentence about a move that
 * does not exist in the position.
 */
export function validateGrounding(item: LlmExplainItem, facts: ExplanationFacts): boolean {
  const allowed = new Set(facts.allowedMoves);
  // Compare without check/mate suffixes — "Qxb5" and "Qxb5+" are the same move,
  // and the model may reasonably drop or add the marker.
  const bare = new Set([...allowed].map(stripSuffix));
  const squares = knownSquares(facts);

  for (const field of [item.whatWentWrong, item.whyBetter, item.takeaway]) {
    for (const token of field.match(SAN_TOKEN) ?? []) {
      if (allowed.has(token) || bare.has(stripSuffix(token))) continue;
      // A coordinate naming a square from one of the engine's own lines is a
      // reference, not an invented move.
      if (BARE_SQUARE.test(token) && squares.has(token)) continue;
      return false;
    }
  }
  return true;
}

function stripSuffix(san: string): string {
  return san.replace(/[+#]$/, '');
}

/**
 * Validate a raw model response and return only the items that are both
 * well-formed AND grounded, keyed by example id. Anything rejected is simply
 * absent, and the caller falls back to the deterministic prose.
 */
export function collectGroundedExplanations(
  raw: unknown,
  factsById: Map<string, ExplanationFacts>,
): Map<string, LlmExplainItem> {
  const out = new Map<string, LlmExplainItem>();
  const parsed = LlmExplainSchema.safeParse(raw);
  if (!parsed.success) return out;

  for (const item of parsed.data.explanations) {
    const facts = factsById.get(item.id);
    // An id we never asked about — the model invented the whole entry.
    if (!facts) continue;
    if (!validateGrounding(item, facts)) continue;
    out.set(item.id, item);
  }
  return out;
}
