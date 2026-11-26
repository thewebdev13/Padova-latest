import { redirect } from 'next/navigation';
import { workspacePath, WORKSPACE_HOME_PAGE } from '@/lib/workspace-routes';

export const dynamic = 'force-dynamic';

/** Plan home: /w → Bookings list */
export default function WorkspaceIndex() {
  redirect(workspacePath(WORKSPACE_HOME_PAGE));
}
