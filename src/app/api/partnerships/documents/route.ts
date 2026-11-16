import { NextResponse } from 'next/server';
import { currentActor, validateOrigin } from '@/lib/auth';
import { database } from '@/lib/db';
import { AccessError } from '@/lib/users';
import { storeDocument } from '@/lib/partnerships/documents';
import { partnershipError } from '@/lib/partnerships/http';
export async function POST(request: Request) {
  try {
    const actor = await currentActor();
    if (!actor) throw new AccessError('Sign in required', 401);
    validateOrigin(request);
    const limit = 11 * 1024 * 1024;
    if (Number(request.headers.get('content-length')) > limit) throw new Error('File too large');
    const reader = request.body?.getReader();
    if (!reader) throw new Error('File required');
    const chunks: Uint8Array[] = [];
    let length = 0;
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      length += next.value.length;
      if (length > limit) {
        await reader.cancel();
        throw new Error('File too large');
      }
      chunks.push(next.value);
    }
    const data = await new Response(Buffer.concat(chunks), {
      headers: { 'Content-Type': request.headers.get('content-type') ?? '' },
    }).formData();
    const file = data.get('file');
    if (!(file instanceof File)) throw new Error('File required');
    const result = await storeDocument(
      await database(),
      actor,
      String(data.get('organization_id')),
      file.name,
      file.type,
      Buffer.from(await file.arrayBuffer()),
      { commandId: String(data.get('command_id') || crypto.randomUUID()) },
    );
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return partnershipError(e);
  }
}
