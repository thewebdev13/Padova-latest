import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const p = spawn(
  process.execPath,
  [
    require.resolve('tsx/cli'),
    '--test',
    '--test-concurrency=1',
    'tests/financial.test.ts',
    'tests/financial-truth.test.ts',
    'tests/extended.test.ts',
    'tests/fulfillment.test.ts',
    'tests/travel-edit.test.ts',
    'tests/fulfillment-edit.test.ts',
    'tests/reward-guard.test.ts',
    'tests/booking-entry.test.ts',
    'tests/booking-derived.test.ts',
    'tests/final-integrity.test.ts',
    'tests/redteam-booking.test.ts',
    'tests/financial-import-binding.test.ts',
    'tests/v1-master.test.ts',
    'tests/owner-proxy.test.ts',
    'tests/go-forward.test.ts',
    'tests/targeted-entry.test.ts',
  ],
  { stdio: 'inherit', env: { ...process.env, PADOVA_TEST_STORE: 'existing' } },
);
p.on('exit', (code) => process.exit(code ?? 1));
