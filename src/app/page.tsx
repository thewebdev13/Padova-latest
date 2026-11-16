import Workspace from './workspace';
export const dynamic = 'force-dynamic';
export default function Home() {
  return <Workspace synthetic={process.env.PADOVA_QA === '1' || !process.env.DATABASE_URL} />;
}
