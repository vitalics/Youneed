# create-youneedpackage

Internal, **non-publishable** (`"private": true`) scaffolder for new
`@youneed/*` workspace packages.

## Usage

```sh
# scaffold packages/<name>
pnpm create-youneedpackage <name> [description]

# interactive (prompts for name + description)
pnpm create-youneedpackage
```

It creates `packages/<name>/` with:

- `package.json` — `@youneed/<name>`, `dist` outputs, `build` script
- `tsconfig.build.json` — extends the root `tsconfig.base.json`
- `src/index.ts` — public entry point stub
- `.npmignore` + `README.md`

and registers `@youneed/<name>` in the root `tsconfig.base.json` `paths` so the
monorepo resolves it during development. Afterwards run `pnpm install`.

> The published-package form `pnpm create youneedpackage` resolves the registry
> package `create-youneedpackage`; since this one is private it is invoked via
> its local workspace bin (`pnpm create-youneedpackage`).
