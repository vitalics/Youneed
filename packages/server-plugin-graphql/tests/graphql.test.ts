// Run: pnpm --filter @youneed/server-plugin-graphql test
// Tests the pure `executeOperation` helper (shared by the POST/GET routes) and the
// GraphQL instance's ring buffer — a tiny SDL schema with rootValue resolvers, no
// HTTP server. NOTE: needs the `graphql` npm module installed (a runtime dep).
import { Test, expect } from "@youneed/test";
import { TestApplication } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import { buildSchema } from "graphql";
import { executeOperation, createGraphQL, GraphQL } from "../src/index.ts";

const SDL = /* GraphQL */ `
  type Query {
    hello: String
    add(a: Int, b: Int): Int
    boom: String
  }
`;

const rootValue = {
  hello: () => "hi",
  add: ({ a, b }: { a: number; b: number }) => a + b,
  boom: () => {
    throw new Error("kaboom");
  },
};

class GraphQLSuite extends Test({ name: "@youneed/server-plugin-graphql" }) {
  @Test.it("executes a query against the schema") async runsQuery() {
    const schema = buildSchema(SDL);
    const result = await executeOperation(schema, { query: "{ hello }" }, { rootValue });
    expect(result.data).toEqual({ hello: "hi" });
    expect(result.errors).toBe(undefined);
  }

  @Test.it("passes variables through to resolvers") async variables() {
    const schema = buildSchema(SDL);
    const result = await executeOperation(
      schema,
      { query: "query Sum($a: Int, $b: Int) { add(a: $a, b: $b) }", variables: { a: 2, b: 3 } },
      { rootValue },
    );
    expect(result.data).toEqual({ add: 5 });
  }

  @Test.it("reports a missing query as an error") async missingQuery() {
    const schema = buildSchema(SDL);
    const result = await executeOperation(schema, {}, { rootValue });
    expect(result.data).toBe(undefined);
    expect(result.errors?.[0]?.message).toContain("query string");
  }

  @Test.it("surfaces a resolver error in `errors`") async resolverError() {
    const schema = buildSchema(SDL);
    const result = await executeOperation(schema, { query: "{ boom }" }, { rootValue });
    expect(result.errors?.length).toBe(1);
    expect(result.errors?.[0]?.message).toContain("kaboom");
  }

  @Test.it("rejects an invalid field with a validation error") async invalidField() {
    const schema = buildSchema(SDL);
    const result = await executeOperation(schema, { query: "{ nope }" }, { rootValue });
    expect(result.errors?.length).toBeGreaterThan(0);
    expect(result.data).toBe(undefined);
  }

  @Test.it("GraphQL instance records recent ops + counts") async records() {
    const gql: GraphQL = createGraphQL({ schema: SDL, rootValue });
    await gql.execute({ query: "{ hello }" });
    await gql.execute({ query: "query Bad { boom }" });
    expect(gql.count).toBe(2);
    const recent = gql.recent();
    expect(recent.length).toBe(2);
    expect(recent[0]?.ok).toBe(true);
    expect(recent[1]?.ok).toBe(false);
    expect(recent[1]?.operationName).toBe("Bad");
  }

  @Test.it("exposes the SDL and a type count") async sdl() {
    const gql = createGraphQL({ schema: SDL, rootValue });
    expect(gql.sdl).toContain("type Query");
    expect(gql.typeCount).toBeGreaterThan(0);
  }
}

await TestApplication().addTests(GraphQLSuite).reporter(new ConsoleReporter()).run();
