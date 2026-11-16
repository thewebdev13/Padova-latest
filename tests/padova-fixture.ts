import { readFile } from 'node:fs/promises';
import { createDatabase } from '../src/lib/db';
import { padovaStorage } from '../src/lib/padova-storage';
import type { AuthProvider } from '../src/lib/supabase-auth';
export async function existingFixture(
  provider?: AuthProvider,
  beforeExtensions?: (raw: import('../src/lib/db').Database) => Promise<void>,
  reviewPackage = false,
  fulfillment = false,
) {
  const raw = await createDatabase(true);
  try {
    await raw.exec(await readFile('tests/fixtures/existing-padova.sql', 'utf8'));
    await raw.exec(`REVOKE ALL ON ALL FUNCTIONS IN SCHEMA padova,public FROM PUBLIC;
   GRANT USAGE ON SCHEMA padova TO authenticated;
   GRANT EXECUTE ON FUNCTION public.padova_activate_owner(),public.padova_booking_detail(uuid),public.padova_command(text,jsonb,uuid),public.padova_historical_bookings(text,integer),public.padova_historical_directory(text,integer),public.padova_manage_staff(text,boolean),public.padova_read(text,text,integer),public.padova_references(),padova.booking_detail(uuid),padova.command(text,jsonb,uuid),padova.manage_staff(text,boolean),padova.read_data(text,text,integer) TO authenticated;
   ALTER DEFAULT PRIVILEGES IN SCHEMA padova GRANT ALL ON TABLES TO anon,authenticated,service_role;`);
    if (beforeExtensions) await beforeExtensions(raw);
    if (reviewPackage) await raw.exec(await readFile('db/padova/review-install.sql', 'utf8'));
    else
      await raw.transaction(async (tx) => {
        for (const file of [
          'adapter-core',
          'adapter-ledgers',
          'adapter-security',
          'adapter-integrity',
          'adapter-grants',
        ]) {
          try {
            await tx.exec(await readFile(`db/padova/${file}.sql`, 'utf8'));
          } catch (e: any) {
            throw new Error(`${file}: ${e.message} at ${e.position ?? e.where ?? ''}`);
          }
        }
      });
    if (fulfillment)
      await raw.transaction(async (tx) => {
        for (const migration of [
          'supabase/migrations/20261029012515_padova_fulfillment_catalogs_units.sql',
          'supabase/migrations/20261029131534_padova_owned_reward_reversal_positions.sql',
          'supabase/migrations/20261029195159_padova_booking_entry.sql',
          'supabase/migrations/20261029225428_final_entry_integrity.sql',
          'supabase/migrations/20261030125035_v1_source_profiles.sql',
          'supabase/migrations/20261101193320_commission_payables.sql',
          'supabase/migrations/20261101221513_targeted_entry_reliability.sql',
          'supabase/migrations/20261104224500_historical_import_native_decision.sql',
        ])
          await tx.exec(await readFile(migration, 'utf8'));
      });
    return { raw, db: padovaStorage(raw, provider) };
  } catch (e) {
    await raw.close();
    throw e;
  }
}
