// Run: pnpm --filter @youneed/orm-adapter-postgres test
// Pure dialect unit test — no Postgres server needed. The driver/connect path
// (network) is exercised manually (see README) but not asserted here.
import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import { postgresDialect } from "../src/index.ts";

class PostgresDialectSuite extends Test({ name: "@youneed/orm-adapter-postgres (dialect)" }) {
  @Test.it("double-quotes identifiers and escapes inner quotes") quote() {
    expect(postgresDialect.quoteId("users")).toBe('"users"');
    expect(postgresDialect.quoteId('we"ird')).toBe('"we""ird"');
  }

  @Test.it("uses positional $n placeholders (1-based)") placeholders() {
    expect(postgresDialect.placeholder(0)).toBe("$1");
    expect(postgresDialect.placeholder(7)).toBe("$8");
  }

  @Test.it("maps every logical column type") columnTypes() {
    expect(postgresDialect.columnType("int")).toBe("INTEGER");
    expect(postgresDialect.columnType("number")).toBe("DOUBLE PRECISION");
    expect(postgresDialect.columnType("float")).toBe("DOUBLE PRECISION");
    expect(postgresDialect.columnType("boolean")).toBe("BOOLEAN");
    expect(postgresDialect.columnType("date")).toBe("BIGINT");
    expect(postgresDialect.columnType("json")).toBe("JSONB");
    expect(postgresDialect.columnType("text")).toBe("TEXT");
    expect(postgresDialect.columnType("string")).toBe("VARCHAR(255)");
  }

  @Test.it("generates a SERIAL primary key") pk() {
    expect(postgresDialect.primaryGenerated("int")).toBe("SERIAL PRIMARY KEY");
  }

  @Test.it("leaves createIndex to the core (supports IF NOT EXISTS)") noIndexOverride() {
    expect(postgresDialect.createIndex).toBeUndefined();
  }
}

await TestApplication().addTests(PostgresDialectSuite).reporter(new ConsoleReporter()).run();
