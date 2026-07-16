// Run: pnpm --filter @youneed/server-plugin-grpc test
//
// These tests cover the PURE, dependency-free core of the plugin — `describeServices`
// (proto-def → introspection shape) and the `CallStats` tracker — so they run
// WITHOUT `@grpc/grpc-js` / `@grpc/proto-loader` installed and without a live
// gRPC server. They feed `describeServices` a hand-built package-definition
// shaped exactly like `grpc.loadPackageDefinition(protoLoader.loadSync(...))`.
//
// End-to-end coverage (real bind + unary call over the wire) needs the grpc deps
// installed — see the note at the bottom of this file.

import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import { describeServices, describeService, CallStats } from "../src/introspect.ts";

// A loaded package definition, shaped like grpc.loadPackageDefinition output:
// a nested namespace ("greet") whose service entries are constructors carrying
// a `.service` = { methodName → methodDefinition }.
function fakeMethod(name: string, req: string, res: string, reqStream = false, resStream = false) {
  return {
    path: `/greet.Greeter/${name}`,
    originalName: name,
    requestStream: reqStream,
    responseStream: resStream,
    requestType: { type: { name: req } },
    responseType: { type: { name: res } },
  };
}
function fakeLoadedPackage() {
  const GreeterCtor: any = function () {};
  GreeterCtor.service = {
    SayHello: fakeMethod("SayHello", "HelloRequest", "HelloReply"),
    SayHelloStream: fakeMethod("SayHelloStream", "HelloRequest", "HelloReply", false, true),
  };
  return { greet: { Greeter: GreeterCtor, HelloRequest: {}, HelloReply: {} } };
}

let clock = 1000;
const now = () => clock;

class GrpcSuite extends Test({ name: "@youneed/server-plugin-grpc" }) {
  @Test.beforeEach() reset() {
    clock = 1000;
  }

  @Test.it("describeServices flattens nested packages to dotted names") flatten() {
    const services = describeServices(fakeLoadedPackage() as any);
    expect(services.length).toBe(1);
    expect(services[0].name).toBe("greet.Greeter");
    expect(services[0].methods.length).toBe(2);
  }

  @Test.it("describeService maps request/response types + stream flags") mapping() {
    const methods = describeService(fakeLoadedPackage().greet.Greeter.service as any);
    const byName = Object.fromEntries(methods.map((m) => [m.name, m]));
    expect(byName.SayHello.requestType).toBe("HelloRequest");
    expect(byName.SayHello.responseType).toBe("HelloReply");
    expect(byName.SayHello.kind).toBe("unary");
    expect(byName.SayHello.requestStream).toBe(false);
    expect(byName.SayHelloStream.kind).toBe("server-stream");
    expect(byName.SayHelloStream.responseStream).toBe(true);
  }

  @Test.it("describeServices accepts a bare service-definition map") bareDef() {
    const services = describeServices({ Greeter: fakeLoadedPackage().greet.Greeter.service } as any);
    expect(services[0].name).toBe("Greeter");
    expect(services[0].methods.length).toBe(2);
  }

  @Test.it("describeServices sorts methods by name") sorted() {
    const methods = describeServices(fakeLoadedPackage() as any)[0].methods;
    expect(methods.map((m) => m.name)).toEqual(["SayHello", "SayHelloStream"]);
  }

  @Test.it("CallStats counts calls and records newest-first") counts() {
    const stats = new CallStats({ now });
    clock = 1000;
    stats.record("greet.Greeter.SayHello", 990, true);
    clock = 2000;
    stats.record("greet.Greeter.SayHello", 1980, false, "boom");
    const snap = stats.snapshot();
    expect(snap.calls).toBe(2);
    expect(snap.recent[0].method).toBe("greet.Greeter.SayHello");
    expect(snap.recent[0].ok).toBe(false);
    expect(snap.recent[0].error).toBe("boom");
    expect(snap.recent[0].ms).toBe(20); // 2000 - 1980
    expect(snap.recent[1].ok).toBe(true);
    expect(snap.recent[1].ms).toBe(10); // 1000 - 990
  }

  @Test.it("CallStats bounds the recent ring to `keep`") bounded() {
    const stats = new CallStats({ keep: 3, now });
    for (let i = 0; i < 10; i++) stats.record(`m${i}`, now(), true);
    const snap = stats.snapshot();
    expect(snap.calls).toBe(10);
    expect(snap.recent.length).toBe(3);
    expect(snap.recent[0].method).toBe("m9"); // newest first
  }

  @Test.it("CallStats clamps negative durations to 0") clamp() {
    const stats = new CallStats({ now });
    clock = 1000;
    stats.record("m", 2000, true); // start after now → clamp
    expect(stats.snapshot().recent[0].ms).toBe(0);
  }
}

await TestApplication().addTests(GrpcSuite).reporter(new ConsoleReporter()).run();
