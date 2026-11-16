import type { SQL, Row } from './db';

// Descriptive corrections project over immutable acquisition facts. Ownership,
// quantities, basis, parties and financial movements are never replaced here.
export async function effectiveAsset(tx: SQL, asset: Row): Promise<Row> {
  const revisions = (
    await tx.query(
      "SELECT result FROM commands WHERE kind='revise_asset' AND payload->>'asset_id'=$1 AND result IS NOT NULL ORDER BY created_at,id",
      [asset.id],
    )
  ).rows;
  return { ...asset, ...(revisions.at(-1)?.result ?? {}), edit_version: revisions.length };
}
