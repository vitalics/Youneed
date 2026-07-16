import { Page, mountPages } from "@youneed/ssr";
import { Application } from "@youneed/server";
import { UserView, type User } from "./view.ts";
import type { RouteContext } from "@youneed/ssr";
import type { Context } from "@youneed/server";

// Tiny in-memory "database".
const users: Record<string, User> = {
  "1": { id: "1", name: "Ada Lovelace", visits: 0 },
  "2": { id: "2", name: "Grace Hopper", visits: 0 },
};

export class UserPage extends Page("/users/:id", { title: "User", clientScript: "/client.js" }) {
  // GET /users/:id — SSR the document with data; props serialize for hydration.
  override async render(ctx: RouteContext) {
    const user = users[ctx.params.id] ?? { id: ctx.params.id, name: "Unknown", visits: 0 };
    user.visits++;
    return UserView.of({ user });
  }

  // POST /users/:id — rename via the <form>, then PRG redirect back to GET.
  @Page.post()
  async rename(ctx: Context) {
    const id = ctx.params.id;
    const name = (ctx.body as { name?: string })?.name?.trim();
    if (users[id] && name) users[id].name = name;
    return this.redirect(`/users/${id}`);
  }

  // GET /users/:id/stats — extra sub-path GET returning JSON.
  @Page.get("/users/:id/stats")
  async stats(ctx: Context) {
    const u = users[ctx.params.id];
    return this.json(u ? { id: u.id, visits: u.visits } : { error: "not found" }, { status: u ? 200 : 404 });
  }
}

export const app = mountPages(Application(), UserPage);
