// @youneed/server middleware — fail a request that takes longer than `ms`.
// The handler can't be cancelled, but the client gets a timely error instead of
// hanging. Register globally or scope it: `app.use("/slow", timeout(5000))`.
import { HttpError } from "@youneed/server";
import type { Middleware } from "@youneed/server";

export interface TimeoutOptions {
  status?: number; // default 503
  message?: unknown; // default { error: "Request Timeout" }
}

export function timeout(ms: number, opts: TimeoutOptions = {}): Middleware {
  return async (_ctx, next) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tripwire = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new HttpError(opts.status ?? 503, opts.message ?? { error: "Request Timeout" })),
        ms,
      );
    });
    try {
      return await Promise.race([next(), tripwire]);
    } finally {
      clearTimeout(timer);
    }
  };
}
