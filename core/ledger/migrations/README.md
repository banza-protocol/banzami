# Ledger Migrations

The canonical migration for this domain lives at:

```
db/migrations/0001_ledger_schema.sql
```

All migrations are consolidated under `db/migrations/` with globally sequential
version numbers to avoid sqlx version conflicts across domains. Run them with:

```sh
make db-migrate
```
