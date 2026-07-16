# @youneed/ai-skill

A bundle of [Agent Skills](https://docs.claude.com/en/docs/claude-code/skills) that make
Claude an expert in the **youneed** framework. Five skills, each its own directory with a
`SKILL.md` and on-demand `references/`:

| Skill | Directory | Use it for |
|-------|-----------|-----------|
| `youneed` | `.` (root) | components, server, code organization, performance, middleware, React/Vue/Angular & Express/Nest/Bun/Elysia/tRPC migration |
| `youneed-develop` | `develop/` | wiring `@youneed/devtools` (runtime inspector) and `@youneed/ts-plugin` (template autocomplete/diagnostics) |
| `youneed-logging` | `logging/` | `@youneed/logger` + transports (stdout/file/http) + `@youneed/server-plugin-env`; backend correlation & frontend log shipping |
| `youneed-orm` | `orm/` | `@youneed/orm-sql` (SQL entities, CRUD, adapters) and `@youneed/kv` + `@youneed/kv-redis` (NoSQL/KV) |
| `youneed-test` | `testing/` | writing suites/fixtures/mocks with `@youneed/test`, `ctx.signal`/timeouts, parallel/shard runs, reporters, the devtools UI server, and `webServer` preconditions |

## Layout

```
SKILL.md                 youneed — router + ground rules
references/              dom, server, middleware, performance, organization, migrate-{frontend,backend}
develop/  SKILL.md + references/  devtools, ts-plugin
logging/  SKILL.md + references/  logger-core, transports, usage
orm/      SKILL.md + references/  sql, kv
testing/  SKILL.md + references/  authoring, running
```

Progressive disclosure: only a skill's `SKILL.md` loads when it triggers; each
`references/*.md` is read on demand for the matching task. Every file is < 200 lines.

## Using it

**In this repo** — already wired via symlinks under `.claude/skills/`:
`youneed → .`, `youneed-develop → develop`, `youneed-logging → logging`, `youneed-orm → orm`.
The skills are discovered automatically.

**In another project** — symlink each skill into that project's `.claude/skills/`:

```bash
ln -s /path/to/packages/ai-skill            <project>/.claude/skills/youneed
ln -s /path/to/packages/ai-skill/develop    <project>/.claude/skills/youneed-develop
ln -s /path/to/packages/ai-skill/logging    <project>/.claude/skills/youneed-logging
ln -s /path/to/packages/ai-skill/orm        <project>/.claude/skills/youneed-orm
ln -s /path/to/packages/ai-skill/testing    <project>/.claude/skills/youneed-test
```

(Or copy the folders.) For a user-wide install, do the same under `~/.claude/skills/`.

## Maintaining

Each `SKILL.md` carries a ground rule: **verify API names against the source**
(`packages/*/src/*`, package READMEs) before asserting them — the references mirror the code
and can drift. Validate any edit with the skill-creator validator:

```bash
quick_validate.py packages/ai-skill            # and develop / logging / orm
```
