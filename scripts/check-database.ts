import { createDatabase, requireCurrentSchema } from '../src/lib/db';
import { PADOVA_PROJECT } from '../src/lib/project';
import { connectionDiagnostics } from '../src/lib/connection-diagnostics';

if (!process.env.DATABASE_URL)
  throw new Error('Configure the selected US project DATABASE_URL privately in .env.local');
const db = await createDatabase();
try {
  await requireCurrentSchema(db);
  const result = await db.query(`SELECT current_database() AS database,
    current_schema() AS schema,
    (SELECT count(*)::integer FROM padova.app_schema_versions) AS migrations,
    (SELECT count(*)::integer FROM padova.staff) AS staff_count,
    (SELECT operational_entry_enabled FROM padova.settings WHERE id=true) AS operational_entry_enabled`);
  if (result.rows[0]?.schema !== PADOVA_PROJECT.schema)
    throw new Error('Expected the permanent padova schema');
  console.log(
    JSON.stringify(
      {
        project: PADOVA_PROJECT,
        connection: result.rows[0],
        diagnostics: await connectionDiagnostics(),
      },
      null,
      2,
    ),
  );
} finally {
  await db.close();
}
