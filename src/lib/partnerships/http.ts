import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { AccessError } from '../users';
import { ConflictError } from './service';

export function partnershipError(error: unknown) {
  const message =
    error instanceof ZodError
      ? error.issues.map((i) => i.message).join('; ')
      : error instanceof Error
        ? error.message
        : 'Partnership operation failed';
  const status =
    error instanceof AccessError
      ? error.status
      : error instanceof ConflictError
        ? 409
        : message.startsWith('Permission required:')
          ? 403
          : 400;
  return NextResponse.json(
    {
      error: /violates|relation|column|syntax|connection|bind message|prepared statement/i.test(
        message,
      )
        ? 'Partnership operation could not be completed. Check the input and module setup.'
        : message,
    },
    { status, headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function boundedText(request: Request, limit: number) {
  if (Number(request.headers.get('content-length')) > limit) throw new Error('Request too large');
  const reader = request.body?.getReader();
  if (!reader) throw new Error('Request body required');
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > limit) {
      await reader.cancel();
      throw new Error('Request too large');
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}
