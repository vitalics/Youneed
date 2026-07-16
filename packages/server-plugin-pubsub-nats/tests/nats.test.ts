// Run: pnpm --filter @youneed/server-plugin-pubsub-nats test
import { Test, expect, TestApplication } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import { NatsPubSub, type NatsConnectionLike, type NatsMsgLike, type NatsSubscriptionLike } from "../src/index.ts";

// A pushable async-iterable subscription: tests call `push(msg)` to deliver a
// message to whatever is consuming the iterator, and `unsubscribe()` ends it.
function makeSubscription() {
  const queue: NatsMsgLike[] = [];
  const waiters: Array<(r: IteratorResult<NatsMsgLike>) => void> = [];
  let done = false;
  let unsubscribed = false;
  const sub: NatsSubscriptionLike = {
    unsubscribe() {
      unsubscribed = true;
      done = true;
      for (const w of waiters.splice(0)) w({ value: undefined as never, done: true });
    },
    [Symbol.asyncIterator]() {
      return {
        next(): Promise<IteratorResult<NatsMsgLike>> {
          if (queue.length) return Promise.resolve({ value: queue.shift()!, done: false });
          if (done) return Promise.resolve({ value: undefined as never, done: true });
          return new Promise((resolve) => waiters.push(resolve));
        },
      };
    },
  };
  return {
    sub,
    push(msg: NatsMsgLike) {
      const w = waiters.shift();
      if (w) w({ value: msg, done: false });
      else queue.push(msg);
    },
    get unsubscribed() {
      return unsubscribed;
    },
  };
}

// A fake NatsConnection: records every (subject, bytes) published, and hands out
// the pushable subscription per subject so the test can inject a Msg.
function fakeNats() {
  const published: Array<{ subject: string; data: Uint8Array }> = [];
  const subs = new Map<string, ReturnType<typeof makeSubscription>>();
  let drained = false;
  const conn: NatsConnectionLike = {
    publish(subject, data) {
      published.push({ subject, data });
      const s = subs.get(subject);
      if (s) s.push({ data });
    },
    subscribe(subject) {
      const s = makeSubscription();
      subs.set(subject, s);
      return s.sub;
    },
    async drain() {
      drained = true;
    },
    async close() {},
  };
  return {
    conn,
    published,
    sub(subject: string) {
      return subs.get(subject);
    },
    get drained() {
      return drained;
    },
  };
}

class NatsSuite extends Test({ name: "server-plugin-pubsub-nats" }) {
  @Test.it("publish encodes the message to the subject") async publishEncodes() {
    const fake = fakeNats();
    const bus = new NatsPubSub({ connection: fake.conn });
    await bus.publish("events", "user.created");
    expect(fake.published.length === 1).toBeTruthy();
    expect(fake.published[0].subject === "events").toBeTruthy();
    expect(new TextDecoder().decode(fake.published[0].data) === "user.created").toBeTruthy();
  }

  @Test.it("subscribe delivers decoded string + channel to the handler") async subscribeDelivers() {
    const fake = fakeNats();
    const bus = new NatsPubSub({ connection: fake.conn });
    const got: string[] = [];
    await bus.subscribe("events", (m, ch) => void got.push(`${ch}:${m}`));
    // Inject a Msg into the subscription's async iterator.
    fake.sub("events")!.push({ data: new TextEncoder().encode("hello") });
    await new Promise((r) => setTimeout(r, 10));
    expect(got[0] === "events:hello").toBeTruthy();
  }

  @Test.it("Subscription.close unsubscribes") async closeUnsubscribes() {
    const fake = fakeNats();
    const bus = new NatsPubSub({ connection: fake.conn });
    const subscription = await bus.subscribe("events", () => {});
    expect(fake.sub("events")!.unsubscribed === false).toBeTruthy();
    await subscription.close();
    expect(fake.sub("events")!.unsubscribed === true).toBeTruthy();
  }

  @Test.it("name is 'nats'") async name() {
    const bus = new NatsPubSub({ connection: fakeNats().conn });
    expect(bus.name === "nats").toBeTruthy();
  }
}

await TestApplication().addTests(NatsSuite).reporter(new ConsoleReporter()).run();
