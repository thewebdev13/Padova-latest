import { NextResponse } from 'next/server';
import { z } from 'zod';
import { currentActor, validateOrigin } from '@/lib/auth';
import { database } from '@/lib/db';
import { readJSON } from '@/lib/http';
import { AccessError } from '@/lib/users';
import { importPartnershipBundle, type ImportBundle } from '@/lib/partnerships/import';
import { partnershipError } from '@/lib/partnerships/http';
const bundleSchema = z
  .object({
    key: z.string().min(1).max(500),
    captureHash: z.string().regex(/^[a-f0-9]{64}$/),
    source: z
      .object({
        key: z.string().min(1).max(500),
        title: z.string().min(1).max(2000),
        kind: z.string().min(1).max(100),
        location: z.string().min(1).max(2000),
        coverage: z.string().min(1).max(10000),
        complete: z.boolean(),
        unavailableReason: z.string().max(10000).optional(),
      })
      .strict(),
    items: z
      .array(
        z
          .object({
            key: z.string().min(1).max(500),
            locator: z.string().max(2000),
            originalText: z.string().max(2000000),
            payload: z.record(z.string(), z.unknown()),
            kind: z.enum([
              'organization',
              'interaction',
              'research',
              'evidence',
              'review',
              'excluded',
            ]),
            matchingMethod: z.string().min(1).max(10000),
            reason: z.string().min(1).max(10000),
          })
          .passthrough(),
      )
      .max(10000),
    exceptions: z.array(z.string().max(10000)).max(1000),
  })
  .strict();
export async function POST(request: Request) {
  try {
    const actor = await currentActor();
    if (!actor) throw new AccessError('Sign in required', 401);
    validateOrigin(request);
    const bundle = bundleSchema.parse(await readJSON(request, 64 * 1024 * 1024)) as ImportBundle;
    const result = await importPartnershipBundle(await database(), actor, bundle);
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return partnershipError(error);
  }
}
