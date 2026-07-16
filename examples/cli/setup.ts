import { Command, table } from "@youneed/cli";
import { color } from "@youneed/cli-middleware-color";
import { prompts } from "@youneed/cli-middleware-prompt";

export class SetupCommand extends Command("setup", {
  description: "Interactive project setup wizard (run in a real terminal)",
  middleware: [color(), prompts()],
}) {
  override async execute() {
    const c = this.color;
    const name = await this.prompt.ask("Project name?", { default: "my-app" });
    const env = await this.prompt.choice("Target environment", [
      { label: "development", value: "dev", hint: "local" },
      { label: "staging", value: "staging" },
      { label: "production", value: "prod", hint: "careful!" },
    ]);
    const features = await this.prompt.list("Enable features", [
      { label: "TypeScript", value: "ts" },
      { label: "ESLint", value: "lint" },
      { label: "Tests", value: "test" },
      { label: "CI", value: "ci" },
    ]);

    if (
      !(await this.prompt.confirm(
        `Create ${c.cyan(name)} for ${c.bold(env)}?`,
        { default: true },
      ))
    ) {
      await this.prompt.alert(c.yellow("Cancelled — nothing was created."));
      return;
    }

    console.log(
      table(
        [
          ["name", name],
          ["environment", env],
          ["features", features.length ? features.join(", ") : c.dim("none")],
        ],
        { head: ["setting", "value"] },
      ),
    );
    await this.prompt.alert(c.green("✓ Project scaffolded!"));
  }
}
