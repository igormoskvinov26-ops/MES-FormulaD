# SQL Migrations

Numbered SQL scripts applied in order to the database. Each migration is idempotent
(safe to re-run) and includes a rollback section commented out at the bottom.

## Convention

```
NNN_short_description.sql
```

- `NNN` — zero-padded sequential number (000, 001, 002, …)
- Each script checks `__SchemaVersion` and skips if already applied
- Rollback block at the end, commented out with `-- ROLLBACK:`

## How to apply

```bash
# Apply all pending migrations (DBA runs manually):
for f in sql/migrations/[0-9]*.sql; do
  sqlcmd -S <server> -d <database> -i "$f"
done
```

The application checks the schema version on startup and logs a warning if it's behind.

## First-time setup

Run `000_create_version_table.sql` to create the `__SchemaVersion` table.
The Docker seed (`docker/init/01-seed.sql`) already includes this table.
