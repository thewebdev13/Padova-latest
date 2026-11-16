import { createDatabase, migrate } from '../src/lib/db';
const db = await createDatabase();
try {
  await migrate(db);
  console.log('Migrations applied.');
} finally {
  await db.close();
}
