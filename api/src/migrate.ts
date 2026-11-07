import { buildMySqlInfrastructure, loadEnv } from './infrastructure/mysql-infrastructure';
import { runMigrations, waitForDatabase } from './shared/infrastructure/mysql';

async function main() {
  const env = loadEnv();
  const { db } = buildMySqlInfrastructure(env);
  await waitForDatabase(db);
  await runMigrations(db);
  console.log('[SlotMatrix Migrate] Migrations applied successfully.');
  await db.close();
}

main().catch((err) => {
  console.error('[SlotMatrix Migrate] Error:', err);
  process.exit(1);
});
