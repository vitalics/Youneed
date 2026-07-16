// ── @youneed/orm-nosql provider — expose repositories on a controller as `this.db` ─
//
// `nosqlProvider(connection, { repositories })` is a @youneed/server controller
// provider: it adds a PRIVATE, typed `this.db` namespace holding the repositories
// you name — so a handler reads `this.db.users.count()` with autocomplete, rather
// than calling the module-global `getCollectionRepository(...)`.
//
//   const db = await Nosql({ type: "memory", collections: [Users], synchronize: true });
//   const app = Application(UsersController).plugin(db);   // `db` is also a ServerPlugin
//
//   class UsersController extends Controller("/users", {
//     providers: [nosqlProvider(db, { repositories: { users: getCollectionRepository(Users) } })],
//   }) {
//     @Controller.get()
//     async list() {
//       return this.db.users.find(); // `users` autocompletes
//     }
//   }
//
// Unlike a guard or middleware (which only gate/transform a request), a provider
// EXTENDS the instance — the contributed members are private to the controller.

import type { ControllerProvider } from "@youneed/server";
import type { Connection, Repository } from "./nosql.ts";

/** A named map of repositories (`{ users: Repository<User>, … }`). `Repository<E>`
 *  is invariant in `E`, so the element type is `Repository<any>` — the concrete
 *  element types survive via the generic `R`. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type RepositoryMap = Record<string, Repository<any>>;

/** Options for {@link nosqlProvider}. */
export interface NosqlProviderOptions<R extends RepositoryMap> {
  /** Repositories to expose under `this.db` (the keys become `this.db.<key>`). */
  repositories: R;
}

/**
 * A controller provider that contributes `this.db` — the given repository map,
 * keyed by name. The `connection` is held for lifecycle/identity; the repositories
 * are already bound to it. Plug into `Controller(path, { providers: [nosqlProvider(...)] })`.
 */
export function nosqlProvider<R extends RepositoryMap>(
  connection: Connection,
  options: NosqlProviderOptions<R>,
): ControllerProvider<{ readonly db: R }> {
  const { repositories } = options;
  return {
    install(instance) {
      void connection;
      Object.defineProperty(instance, "db", { configurable: true, value: repositories });
    },
  };
}
