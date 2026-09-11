/**
 * RLS regression guard — asserts every table in the `public` schema has Row
 * Level Security enabled. Catches the "new table shipped without RLS" mistake
 * (the Supabase advisor flags it too, but this makes it a hard, local gate).
 *
 * Read-only; safe to run anytime. Run after deploys or in CI:
 *   pnpm --filter worker exec tsx scripts/checkRls.ts
 * Exits non-zero listing any offending tables.
 */
import { PrismaClient } from '@chess-coach/db';

const db = new PrismaClient();

async function main(): Promise<void> {
  const rows = await db.$queryRaw<Array<{ table_name: string; rls_enabled: boolean }>>`
    SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
    ORDER BY c.relname`;
  // Prisma maps booleans fine, but be defensive about driver quirks.
  const offenders = rows.filter((r) => r.rls_enabled !== true).map((r) => r.table_name);

  if (offenders.length > 0) {
    console.error(
      `RLS check FAILED — ${offenders.length} table(s) without Row Level Security:\n` +
        offenders.map((t) => `  - ${t}`).join('\n') +
        `\nEnable RLS in the table's migration (see 0000000000004_enable_rls for the convention).`,
    );
    process.exit(1);
  }
  console.log(`RLS check OK — all ${rows.length} public tables have Row Level Security enabled.`);
}

main()
  .catch((err) => {
    console.error('RLS check errored:', err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
