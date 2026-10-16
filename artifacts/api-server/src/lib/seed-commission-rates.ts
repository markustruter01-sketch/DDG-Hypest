import { commissionRatesTable, db } from "@workspace/db";

const SEED_RATES = [
  { source: "creator_brought", commissionBps: 1000 },
  { source: "hypest_found", commissionBps: 2000 },
] as const;

/** Insert the commission rates only when the table has no rows. */
export async function seedCommissionRatesIfEmpty(): Promise<void> {
  const existing = await db
    .select({ id: commissionRatesTable.id })
    .from(commissionRatesTable)
    .limit(1);

  if (existing.length > 0) {
    return;
  }

  await db.insert(commissionRatesTable).values([...SEED_RATES]);
}
