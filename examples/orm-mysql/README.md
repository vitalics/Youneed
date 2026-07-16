# example: orm-sql + orm-adapter-mysql

`@youneed/orm-sql` entities persisted to **MySQL** via `@youneed/orm-adapter-mysql`.

```bash
# 1) a MySQL to talk to
docker run --rm -e MYSQL_ROOT_PASSWORD=root -e MYSQL_DATABASE=test -p 3306:3306 mysql:8

# 2) run it
pnpm examples:orm:mysql
```

Connection is env-overridable: `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_USER`,
`MYSQL_PASSWORD`, `MYSQL_DB`.

The same entity classes and `getRepository(...)` calls work against the built-in
SQLite adapter too — only the `adapter` + connection settings in `Orm({...})`
change. Run against a **fresh** database: `synchronize` creates the schema, and
MySQL indexes can't be re-created with `IF NOT EXISTS`.
