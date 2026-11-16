import Workspace from './workspace';
import { workspaceSyntheticFlag } from '@/lib/workspace-routes';

export const dynamic = 'force-dynamic';

/** Root keeps working for bookmarks and /#reset= password links. Client migrates to /w/…. */
export default function Home() {
  return <Workspace synthetic={workspaceSyntheticFlag()} />;
}
