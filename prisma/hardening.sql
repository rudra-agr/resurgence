-- OPTIONAL database-level hardening. NOT applied automatically and NOT wired into any script.
-- Makes "AuditEvent" append-only: any UPDATE or DELETE raises an error.
--
-- Apply once, against the database you want to protect:
--   psql "$DATABASE_URL" -f prisma/hardening.sql
--
-- Side effects to know about:
--   * Deleting a Need (which cascades to its audit events) will fail. That is intended.
--   * `prisma db push --force-reset` / `prisma migrate reset` will fail on this table.
--   * Remove with:  DROP TRIGGER audit_event_immutable ON "AuditEvent";
--                   DROP TRIGGER audit_event_no_truncate ON "AuditEvent";
--                   DROP FUNCTION audit_event_block_change();

CREATE OR REPLACE FUNCTION audit_event_block_change() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'AuditEvent is append-only: % is not allowed', TG_OP;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_event_immutable ON "AuditEvent";
CREATE TRIGGER audit_event_immutable
  BEFORE UPDATE OR DELETE ON "AuditEvent"
  FOR EACH ROW EXECUTE FUNCTION audit_event_block_change();

DROP TRIGGER IF EXISTS audit_event_no_truncate ON "AuditEvent";
CREATE TRIGGER audit_event_no_truncate
  BEFORE TRUNCATE ON "AuditEvent"
  FOR EACH STATEMENT EXECUTE FUNCTION audit_event_block_change();

-- ALTERNATIVE (instead of the triggers): run the app as a restricted role that can only add and read
-- audit rows. Replace app_user with the role in your DATABASE_URL, and run migrations as a different role.
--
-- REVOKE UPDATE, DELETE, TRUNCATE ON "AuditEvent" FROM app_user;
-- GRANT SELECT, INSERT ON "AuditEvent" TO app_user;
