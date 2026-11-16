# Independent recovery backup

Current status: an encrypted off-device checkpoint and Node-only recovery tool are saved in the private Padova Travel Backups folder. All 167 registered evidence files match their original hashes and are included. Isolated restoration of all 98 Padova/staging/test tables and safe Auth identities passed, and remote readback is byte-identical. See BUILD_STATE for exact archive links/checksums and RECOVERY_RUNBOOK for recovery steps.

## Separate privileges and secret custody

The initial broad proposal was rejected by automatic review. The Owner subsequently approved a narrower persistent `padova_backup` reader: NOINHERIT, no superuser/database/role/replication administration, connection limit two, default read-only transactions, BYPASSRLS and explicit read grants to required base tables. No `pg_read_all_data` membership was granted. Verification found zero table-writing or schema-creation privileges, no SELECT on `vault.decrypted_secrets` and no Vault function execution. Only encrypted `vault.secrets` is readable.

Supabase-managed Auth schema USAGE could not be delegated. A fixed-scope SECURITY DEFINER export, callable only by the backup reader, returns recoverable identities/schema metadata without plaintext login, MFA or provider secrets. The application role cannot invoke it. Renewable proofs/sessions are intentionally omitted and must be invalidated on restoration. Future required provider/MFA/Vault secret material must be preserved separately; Vault currently has zero rows and Storage has zero objects.

The Drive archive excludes runtime credentials and encryption keys. Google Password Manager confirmed six Recovery Kit entries saved in bookings@padovatravels.com. The additional padawer3322@gmail.com copy and further backup/scheduling work are explicitly deferred by the Owner to prioritize V1 completion. No claim is made that the second copy or unattended backup service exists.

## Operational safeguard

Normal entry was enabled after complete captured domain/Auth/source restoration, remote readback and verified business-account key custody. The second vault copy and recurring backup administration were deferred by the Owner. Future disaster recovery must revalidate before reopening writes. Exact limitations and next steps are recorded in BUILD_STATE. No existing rows, evidence, passwords, test schemas or original function bodies were deleted/replaced by this backup work.

References: [Supabase backup-reader guidance](https://supabase.com/kb/troubleshooting/pg_dump-fails-with-query-would-be-affected-by-row-level-security-policy), [schema-scoped read grants](https://supabase.com/kb/troubleshooting/revoking-privileges-on-storage-pg_cron-vault-and-extension-objects-has-no-effect).
