import { z } from 'zod';
import { type Database, type Row, one } from './db';
import { type Actor, requirePermission } from './permissions';
import { AccessError, freshActor } from './users';

const id = z.string().uuid();
const text = z.string().trim().min(1).max(500);
const optional = z.string().max(5000).default('');

export const hotelDirectorySchema = z
  .object({
    id: id.optional(),
    version: z.number().int().positive().optional(),
    location: text,
    hotel_name: text,
    corporate_code: optional,
    iata_code: optional,
    hotel_commission: optional,
    commission_rate_bps: z.number().int().min(0).max(10000).nullable().optional(),
    best_book_method: optional,
    discounts: optional,
    notes: optional,
    organization_id: id.nullable().optional(),
    party_id: id.nullable().optional(),
    status: z.enum(['active', 'archived']).default('active'),
  })
  .strict();

export async function hotelDirectoryEnabled(db: Database) {
  const schema = db.storage === 'padova' ? 'padova' : 'public';
  return Boolean(
    (await db.query('SELECT to_regclass($1) name', [`${schema}.pt_hotel_directory`])).rows[0]
      ?.name,
  );
}

async function actorForWrite(db: Database, actor: Actor) {
  if (!z.string().uuid().safeParse(actor.id).success)
    throw new AccessError('Individual staff identity required', 401);
  actor = await freshActor(db, actor);
  requirePermission(actor, 'view_partnerships');
  requirePermission(actor, 'manage_partnerships');
  return actor;
}

async function actorForRead(db: Database, actor: Actor) {
  if (!z.string().uuid().safeParse(actor.id).success)
    throw new AccessError('Individual staff identity required', 401);
  actor = await freshActor(db, actor);
  requirePermission(actor, 'view_partnerships');
  return actor;
}

export async function listHotelDirectory(
  db: Database,
  actor: Actor,
  params: { q?: string; location?: string; includeArchived?: boolean } = {},
) {
  await actorForRead(db, actor);
  if (!(await hotelDirectoryEnabled(db)))
    return { enabled: false, hotels: [] as Row[], note: 'Hotel directory is not installed yet' };
  const conditions = ["($1::boolean OR h.status='active')"];
  const values: unknown[] = [Boolean(params.includeArchived)];
  if (params.location?.trim()) {
    values.push(`%${params.location.trim()}%`);
    conditions.push(`h.location ILIKE $${values.length}`);
  }
  if (params.q?.trim()) {
    values.push(`%${params.q.trim()}%`);
    conditions.push(
      `(h.hotel_name ILIKE $${values.length} OR h.corporate_code ILIKE $${values.length} OR h.iata_code ILIKE $${values.length} OR h.best_book_method ILIKE $${values.length} OR h.discounts ILIKE $${values.length})`,
    );
  }
  const hotels = (
    await db.query(
      `SELECT h.*, g.name organization_name, p.name party_name
       FROM pt_hotel_directory h
       LEFT JOIN pt_organizations g ON g.id=h.organization_id
       LEFT JOIN parties p ON p.id=h.party_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY h.location, h.hotel_name
       LIMIT 500`,
      values,
    )
  ).rows;
  return { enabled: true, hotels };
}

export async function saveHotelDirectory(db: Database, actor: Actor, raw: unknown) {
  actor = await actorForWrite(db, actor);
  if (!(await hotelDirectoryEnabled(db)))
    throw new Error('Hotel directory is not installed in this database');
  const data = hotelDirectorySchema.parse(raw);
  if (data.organization_id)
    await one(db, 'SELECT id FROM pt_organizations WHERE id=$1', [data.organization_id]);
  if (data.party_id) await one(db, 'SELECT id FROM parties WHERE id=$1 AND archived_at IS NULL', [data.party_id]);

  if (data.id) {
    if (!data.version) throw new Error('Hotel directory updates require the current version');
    const updated = (
      await db.query(
        `UPDATE pt_hotel_directory SET
           location=$3, hotel_name=$4, corporate_code=$5, iata_code=$6,
           hotel_commission=$7, commission_rate_bps=$8, best_book_method=$9,
           discounts=$10, notes=$11, organization_id=$12, party_id=$13, status=$14,
           version=version+1, actor_id=$15, updated_at=now()
         WHERE id=$1 AND version=$2
         RETURNING *`,
        [
          data.id,
          data.version,
          data.location,
          data.hotel_name,
          data.corporate_code,
          data.iata_code,
          data.hotel_commission,
          data.commission_rate_bps ?? null,
          data.best_book_method,
          data.discounts,
          data.notes,
          data.organization_id ?? null,
          data.party_id ?? null,
          data.status,
          actor.id,
        ],
      )
    ).rows[0];
    if (!updated) throw new Error('Hotel directory row changed; reload and retry');
    return updated;
  }

  return one(
    db,
    `INSERT INTO pt_hotel_directory(
       location, hotel_name, corporate_code, iata_code, hotel_commission, commission_rate_bps,
       best_book_method, discounts, notes, organization_id, party_id, status, actor_id
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
    [
      data.location,
      data.hotel_name,
      data.corporate_code,
      data.iata_code,
      data.hotel_commission,
      data.commission_rate_bps ?? null,
      data.best_book_method,
      data.discounts,
      data.notes,
      data.organization_id ?? null,
      data.party_id ?? null,
      data.status,
      actor.id,
    ],
  );
}
