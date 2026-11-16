import { NextResponse } from 'next/server';
import { database } from '@/lib/db';
import { exchangeCode } from '@/lib/partnerships/oauth';
import { boundedText } from '@/lib/partnerships/http';
export async function POST(request: Request) {
  try {
    const text = await boundedText(request, 10000);
    return NextResponse.json(
      await exchangeCode(await database(), Object.fromEntries(new URLSearchParams(text))),
      { headers: { 'Cache-Control': 'no-store', Pragma: 'no-cache' } },
    );
  } catch {
    return NextResponse.json(
      { error: 'invalid_grant' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
