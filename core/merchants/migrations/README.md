# Merchant Migrations

The canonical migration for this domain lives at:

```
db/migrations/0004_merchants_schema.sql
```

All migrations are consolidated under `db/migrations/` with globally sequential
version numbers. Run them with:

```sh
make db-migrate
```
