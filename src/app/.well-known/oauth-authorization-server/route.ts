import { NextResponse } from 'next/server';
import { authorizationMetadata } from '@/lib/partnerships/oauth';
export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    return NextResponse.json(authorizationMetadata(), { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'Connection is not configured' }, { status: 503 });
  }
}
