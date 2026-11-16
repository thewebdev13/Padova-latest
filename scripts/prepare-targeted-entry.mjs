import { readFile, writeFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const files = (await readdir('supabase/migrations')).filter((f) =>
  f.endsWith('_targeted_entry_reliability.sql'),
);
if (files.length !== 1)
  throw new Error('Use the official CLI migration new targeted_entry_reliability first');
const old = await readFile(
  'supabase/migrations/20261029012515_padova_fulfillment_catalogs_units.sql',
  'utf8',
);
let balance = old.match(/CREATE OR REPLACE VIEW padova.app_asset_balances[^;]+;/)?.[0];
if (!balance) throw new Error('Existing unit-aware asset view is missing');
const known =
  'COALESCE((SELECT sum(basis) FROM padova.app_asset_movements m WHERE m.asset_id=a.id),0)::bigint';
if (!balance.includes(known))
  throw new Error('Review current asset view before preparing extension');
balance = balance.replace(
  known,
  `CASE WHEN EXISTS(SELECT 1 FROM padova.app_asset_lots l WHERE l.asset_id=a.id AND l.cost IS NULL AND (SELECT sum(quantity) FROM padova.app_asset_movements m WHERE m.lot_id=l.id)>0) THEN NULL ELSE ${known} END`,
);
const sql = `-- QA/SYNTHETIC ONLY in this pass. Prepared for review; DO NOT APPLY TO PRODUCTION.
ALTER TABLE padova.asset_lots ALTER COLUMN cost DROP NOT NULL;
ALTER TABLE padova.asset_movements ALTER COLUMN basis_delta DROP NOT NULL;
ALTER TABLE padova.assets ALTER COLUMN original_basis DROP NOT NULL;
ALTER TABLE padova.funding_components ALTER COLUMN cost_basis DROP NOT NULL;
ALTER TABLE padova.refund_movement_links ALTER COLUMN recognized_basis DROP NOT NULL;
${balance}
${await readFile('db/padova/targeted-supplier-corrections.sql', 'utf8')}
INSERT INTO padova.booking_source_methods(name,products,award,created_by) VALUES
 ('Direct Airline',ARRAY['Flight'],false,'system:targeted-entry'),
 ('Direct Provider',ARRAY['Hotel','Car','Other'],false,'system:targeted-entry') ON CONFLICT(name) DO NOTHING;
INSERT INTO padova.app_schema_versions(version) VALUES('20261102_targeted_entry_reliability');
`;
const migration = 'supabase/migrations/' + files[0];
await writeFile(migration, sql);
await writeFile(
  'db/padova/targeted-entry-summary.json',
  JSON.stringify(
    {
      migration,
      sha256: createHash('sha256').update(sql).digest('hex'),
      qaProject: 'cnpyvmhgbtyleckyirye',
      productionApplied: false,
    },
    null,
    2,
  ) + '\n',
);
console.log('Prepared targeted extension locally; no remote changes.');
