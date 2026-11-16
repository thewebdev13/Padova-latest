import { currentActor } from '@/lib/auth';
import { database } from '@/lib/db';
import { AccessError } from '@/lib/users';
import { readDocument } from '@/lib/partnerships/documents';
import { partnershipError } from '@/lib/partnerships/http';
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await currentActor();
    if (!actor) throw new AccessError('Sign in required', 401);
    const d = await readDocument(await database(), actor, (await context.params).id);
    return new Response(new Uint8Array(d.bytes), {
      headers: {
        'Content-Type': d.mimeType,
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(d.filename)}`,
        'Cache-Control': 'private, no-store',
        'Content-Security-Policy': "default-src 'none'; sandbox",
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (e) {
    return partnershipError(e);
  }
}
