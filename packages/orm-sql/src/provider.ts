// ── @youneed/orm-sql provider — expose repositories on a controller as `this.orm` ─
//
// `ormProvider(connection, { repositories })` is a @youneed/server controller
// provider: it adds a PRIVATE, typed `this.orm` namespace holding the repositories
// you name — so a handler reads `this.orm.users.count()` with autocomplete, rather
// than calling the module-global `getRepository(...)`.
//
//   const orm = await Orm({ type: "sqlite", database: ":memory:", tables: [UsersTable], synchronize: true });
//   const app = Application(UsersController).plugin(orm);   // `orm` is also a ServerPlugin
//
//   class UsersController extends Controller("/users", {
//     providers: [ormProvider(orm, { repositories: { users: getRepository(UsersTable) } })],
//   }) {
//     @Controller.get()
//     async list() {
//       const usersCount = await this.orm.users.count(); // `users` autocompletes
//       return { usersCount };
//     }
//   }
//
// Unlike a guard or middleware (which only gate/transform a request), a provider
// EXTENDS the instance — the contributed members are private to the controller.

import type { ControllerProvider } from "@youneed/server";
import type { Connection, Repository } from "./orm.ts";

/** A named map of repositories (`{ users: Repository<User>, … }`). `Repository<E>`
 *  is invariant in `E` (it both consumes and produces `E`), so the element type is
 *  `Repository<any>` — the concrete element types survive via the generic `R`. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type RepositoryMap = Record<string, Repository<any>>;

/** Options for {@link ormProvider}. */
export interface OrmProviderOptions<R extends RepositoryMap> {
  /** Repositories to expose under `this.orm` (the keys become `this.orm.<key>`). */
  repositories: R;
}

/**
 * A controller provider that contributes `this.orm` — the given repository map,
 * keyed by name. The `connection` is held for lifecycle/identity; the repositories
 * are already bound to it. Plug into `Controller(path, { providers: [ormProvider(...)] })`.
 */
export function ormProvider<R extends RepositoryMap>(
  connection: Connection,
  options: OrmProviderOptions<R>,
): ControllerProvider<{ readonly orm: R }> {
  const { repositories } = options;
  return {
    install(instance) {
      // `connection` referenced so the repos' backing connection is pinned even if
      // the default connection later changes; the value exposed is the repo map.
      void connection;
      Object.defineProperty(instance, "orm", { configurable: true, value: repositories });
    },
  };
}
