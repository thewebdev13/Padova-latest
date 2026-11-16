import { productionHealth, productionHealthRead } from '@/lib/production-health';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Public availability booleans only; grants no access to application data. */
export async function GET() {
  const result = await productionHealth(process.env, async () => {
    const { database } = await import('@/lib/db');
    return (await database()).query<{ checked_at: unknown }>(productionHealthRead);
  });
  return Response.json(result, {
    status: result.status === 'healthy' ? 200 : 503,
    headers: { 'Cache-Control': 'no-store, max-age=0' },
  });
}
