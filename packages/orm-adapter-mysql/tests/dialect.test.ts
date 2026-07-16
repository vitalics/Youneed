// Run: pnpm --filter @youneed/orm-adapter-mysql test
// Verifies the SQL dialect deterministically — no MySQL server needed.
import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import { mysqlDialect } from "../src/index.ts";

class MysqlDialectSuite extends Test({ name: "@youneed/orm-adapter-mysql dialect" }) {
  @Test.it("quotes identifiers with backticks (escaping inner backticks)") quote() {
    expect(mysqlDialect.quoteId("users")).toBe("`users`");
    expect(mysqlDialect.quoteId("a`b")).toBe("`a``b`");
  }
  @Test.it("uses ? placeholders") placeholder() {
    expect(mysqlDialect.placeholder(0)).toBe("?");
    expect(mysqlDialect.placeholder(7)).toBe("?");
  }
  @Test.it("maps logical column types to MySQL types") types() {
    expect(mysqlDialect.columnType("string")).toBe("VARCHAR(255)");
    expect(mysqlDialect.columnType("text")).toBe("TEXT");
    expect(mysqlDialect.columnType("int")).toBe("INT");
    expect(mysqlDialect.columnType("number")).toBe("DOUBLE");
    expect(mysqlDialect.columnType("boolean")).toBe("TINYINT(1)");
    expect(mysqlDialect.columnType("json")).toBe("JSON");
    expect(mysqlDialect.columnType("date")).toBe("BIGINT");
  }
  @Test.it("auto-increment primary key") primaryKey() {
    expect(mysqlDialect.primaryGenerated("int")).toBe("INT AUTO_INCREMENT PRIMARY KEY");
  }
  @Test.it("CREATE INDEX omits IF NOT EXISTS (MySQL has no such clause)") index() {
    const sql = mysqlDialect.createIndex!("users", "idx_users_email", ["email"], true);
    expect(sql).toBe("CREATE UNIQUE INDEX `idx_users_email` ON `users` (`email`)");
    expect(sql.includes("IF NOT EXISTS")).toBeFalsy();
    const plain = mysqlDialect.createIndex!("users", "idx_users_action", ["userId", "action"], false);
    expect(plain).toBe("CREATE INDEX `idx_users_action` ON `users` (`userId`, `action`)");
  }
}

await TestApplication().addTests(MysqlDialectSuite).reporter(new ConsoleReporter()).run();
