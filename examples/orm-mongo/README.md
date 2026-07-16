# examples/orm-mongo

`@youneed/orm-nosql` running on a real **MongoDB** via
[`@youneed/orm-adapter-mongo`](../../packages/orm-adapter-mongo).

```bash
# 1) start MongoDB
docker run --rm -p 27017:27017 mongo:7

# 2) run the example
pnpm examples:orm:mongo
```

Override the connection with env vars:

| var         | default                     |
| ----------- | --------------------------- |
| `MONGO_URL` | `mongodb://localhost:27017` |
| `MONGO_DB`  | `youneed_demo`              |

Same entity + repository API as the in-memory reference — only `adapter` + `url`
change. Filters are Mongo-style (`$gte`, `$in`, `$regex`, …); the entity's
`@Collection.id()` field maps to Mongo's `_id`.
