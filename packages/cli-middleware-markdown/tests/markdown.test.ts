import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import { Application, Command } from "@youneed/cli";
import { markdown, renderMarkdown } from "../src/index.ts";

const plain = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "");

class MarkdownSuite extends Test({ name: "cli-middleware-markdown" }) {
  @Test.it("renders headings, bold, code and lists")
  renders() {
    const out = plain(renderMarkdown("# Title\n\nSome **bold** and `code`.\n\n- one\n- two"));
    const lines = out.split("\n");
    expect(lines[0]).toBe("Title");
    expect(out.includes("bold")).toBe(true);
    expect(out.includes(" code ")).toBe(true);
    expect(out.includes("• one")).toBe(true);
  }

  @Test.it("renders a link with its url and a rule")
  linkAndRule() {
    const out = plain(renderMarkdown("[docs](https://x.dev)\n\n---"));
    expect(out.includes("docs")).toBe(true);
    expect(out.includes("(https://x.dev)")).toBe(true);
    expect(out.includes("─")).toBe(true);
  }

  @Test.it("contributes this.markdown")
  contributes() {
    let result = "";
    class Doc extends Command("doc", { middleware: [markdown()] }) {
      execute() {
        result = this.markdown("**hi**");
      }
    }
    const app = Application({ name: "t", commands: [Doc], autoRun: false, stdout() {}, stderr() {} });
    return app.run(["doc"]).then(() => expect(plain(result)).toBe("hi"));
  }
}

await TestApplication().addTests(MarkdownSuite).reporter(new ConsoleReporter()).run();
