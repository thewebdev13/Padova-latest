import { createCipheriv, createDecipheriv, randomBytes, createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Database } from '../db';
import { one } from '../db';
import type { Actor } from '../permissions';
import { partnershipActor, insert, audit, hash, recordInteraction, ConflictError } from './service';
function key() {
  const raw = process.env.PADOVA_PARTNERSHIP_DOCUMENT_KEY;
  if (!raw) throw new Error('Private document encryption is not configured');
  const k = Buffer.from(raw, 'base64');
  if (k.length !== 32) throw new Error('Private document encryption key must be 32 bytes');
  return k;
}
export function encryptDocument(bytes: Buffer, associatedData: string) {
  const nonce = randomBytes(12),
    cipher = createCipheriv('aes-256-gcm', key(), nonce);
  cipher.setAAD(Buffer.from(associatedData));
  const data = Buffer.concat([cipher.update(bytes), cipher.final()]);
  return JSON.stringify({
    v: 1,
    nonce: nonce.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    data: data.toString('base64'),
  });
}
export function decryptDocument(value: string, associatedData: string) {
  const sealed = JSON.parse(value);
  if (sealed.v !== 1) throw new Error('Unknown document encryption version');
  const cipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(sealed.nonce, 'base64'));
  cipher.setAAD(Buffer.from(associatedData));
  cipher.setAuthTag(Buffer.from(sealed.tag, 'base64'));
  return Buffer.concat([cipher.update(Buffer.from(sealed.data, 'base64')), cipher.final()]);
}
export async function storeDocument(
  db: Database,
  actor: Actor,
  organizationId: string,
  filename: string,
  mimeType: string,
  bytes: Buffer,
  options: { commandId?: string; sourceItemId?: string; channel?: 'staff' | 'import' } = {},
) {
  z.string().uuid().parse(organizationId);
  if (!bytes.length || bytes.length > 10485760) throw new Error('Document must be 1 byte to 10 MB');
  const cleanName = filename.replace(/[\x00-\x1f\x7f/\\]/g, '_').slice(0, 180) || 'document';
  const allowed = new Set([
    'application/pdf',
    'image/png',
    'image/jpeg',
    'text/plain',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ]);
  if (!allowed.has(mimeType)) throw new Error('Use PDF, PNG, JPEG, plain text, Word or Excel');
  const commandId = z
    .string()
    .uuid()
    .parse(options.commandId ?? randomUUID());
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const payloadHash = hash({
    organizationId,
    filename: cleanName,
    mimeType,
    sha256,
    sourceItemId: options.sourceItemId ?? null,
  });
  return db.transaction(async (tx) => {
    actor = await partnershipActor(tx, actor, true);
    await tx.query('SELECT pg_advisory_xact_lock(71281103)');
    const previous = (await tx.query('SELECT * FROM pt_commands WHERE id=$1', [commandId])).rows[0];
    if (previous) {
      if (
        previous.actor_id !== actor.id ||
        previous.kind !== 'document' ||
        previous.payload_hash !== payloadHash
      )
        throw new ConflictError('Document request ID was already used for different content');
      return previous.result as { id: string };
    }
    await one(tx, 'SELECT id FROM pt_organizations WHERE id=$1', [organizationId]);
    if (options.sourceItemId)
      await one(tx, 'SELECT id FROM pt_source_items WHERE id=$1 AND organization_id=$2', [
        z.string().uuid().parse(options.sourceItemId),
        organizationId,
      ]);
    const id = randomUUID(),
      channel = options.channel ?? 'staff';
    const interaction = await recordInteraction(tx, actor, commandId, channel, {
      organization_id: organizationId,
      source_item_id: options.sourceItemId ?? null,
      kind: 'document',
      direction: 'internal',
      occurred_at: null,
      subject: cleanName,
      body: `Private document preserved: ${cleanName}\nSHA256: ${sha256}\n${bytes.length} bytes. File content requires authorized document access.`,
    });
    await audit(
      tx,
      actor,
      commandId,
      channel,
      'pt_interactions',
      null,
      interaction,
      'Document added to relationship history',
    );
    const record = await insert(tx, 'pt_documents', {
      id,
      organization_id: organizationId,
      interaction_id: interaction.id,
      filename: cleanName,
      mime_type: mimeType,
      byte_length: bytes.length,
      sha256,
      encrypted_content: encryptDocument(bytes, `${id}:${organizationId}:${sha256}`),
      actor_id: actor.id,
    });
    await audit(
      tx,
      actor,
      commandId,
      channel,
      'pt_documents',
      null,
      record,
      'Added private encrypted document',
    );
    await tx.query(
      'INSERT INTO pt_commands(id,actor_id,kind,payload_hash,result,channel) VALUES($1,$2,$3,$4,$5,$6)',
      [commandId, actor.id, 'document', payloadHash, JSON.stringify({ id }), channel],
    );
    return { id };
  });
}
export async function readDocument(db: Database, actor: Actor, id: string) {
  z.string().uuid().parse(id);
  return db.transaction(async (tx) => {
    await partnershipActor(tx, actor);
    const d = await one(tx, 'SELECT * FROM pt_documents WHERE id=$1', [id]);
    const bytes = decryptDocument(d.encrypted_content, `${d.id}:${d.organization_id}:${d.sha256}`);
    if (createHash('sha256').update(bytes).digest('hex') !== d.sha256)
      throw new Error('Document integrity check failed');
    return { bytes, filename: d.filename, mimeType: d.mime_type };
  });
}
