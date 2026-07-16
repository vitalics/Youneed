# Changesets

This folder is managed by [changesets](https://github.com/changesets/changesets).

- Add a changeset for your change: `pnpm ci:release` (alias for `changeset`) and
  follow the prompts to pick the affected `@youneed/*` packages + bump type.
- On merge to `main`, the release workflow opens/updates a **Version Packages** PR
  that applies the changesets (version bumps + CHANGELOGs). Merging that PR
  publishes the bumped packages to npm.

See the [common questions](https://github.com/changesets/changesets/blob/main/docs/common-questions.md).
