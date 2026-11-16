import { NextResponse } from 'next/server';
import { currentActor, validateOrigin } from '@/lib/auth';
import { database } from '@/lib/db';
import { readJSON } from '@/lib/http';
import { AccessError } from '@/lib/users';
import { partnershipError } from '@/lib/partnerships/http';
import {
  executePartnership,
  partnershipDetail,
  partnershipList,
  sourceRegister,
  recommendedDraft,
  safeValue,
  outreachQueue,
  partnershipChoices,
} from '@/lib/partnerships/service';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try {
    const actor = await currentActor();
    if (!actor) throw new AccessError('Sign in required', 401);
    const db = await database(),
      p = new URL(request.url).searchParams;
    const result =
      p.get('view') === 'choices'
        ? await partnershipChoices(db, actor, p.get('q') ?? '')
        : p.get('view') === 'outreach'
          ? await outreachQueue(db, actor, Number(p.get('offset') ?? 0))
          : p.get('view') === 'sources'
            ? await sourceRegister(db, actor, Number(p.get('offset') ?? 0))
            : p.has('id')
              ? await partnershipDetail(db, actor, p.get('id')!)
              : await partnershipList(db, actor, p);
    if (p.get('recommend') === '1' && 'organization' in result)
      return NextResponse.json(recommendedDraft(result, p.get('opportunity')!, p.get('method')!), {
        headers: { 'Cache-Control': 'no-store' },
      });
    return NextResponse.json(safeValue(result), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return partnershipError(error);
  }
}
export async function POST(request: Request) {
  try {
    const actor = await currentActor();
    if (!actor) throw new AccessError('Sign in required', 401);
    validateOrigin(request);
    const result = await executePartnership(
      await database(),
      actor,
      await readJSON(request, 250000),
    );
    return NextResponse.json({ result }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return partnershipError(error);
  }
}
