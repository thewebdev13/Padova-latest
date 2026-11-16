import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

/** /w → /w/dashboard */
export default function WorkspaceIndex() {
  redirect('/w/dashboard');
}
