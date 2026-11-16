import { notFound } from 'next/navigation';
import Workspace from '../../workspace';
import { isWorkspaceSlug, workspaceSyntheticFlag } from '@/lib/workspace-routes';

export const dynamic = 'force-dynamic';

/** Direct load / refresh: /w/transactions etc. In-app nav uses history.pushState (no remount). */
export default async function WorkspaceSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  if (!isWorkspaceSlug(section)) notFound();
  return <Workspace synthetic={workspaceSyntheticFlag()} />;
}
