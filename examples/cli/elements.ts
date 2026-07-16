import { ChoiceItem, Command, stepper } from "@youneed/cli";
import { color } from "@youneed/cli-middleware-color";
import { prompts } from "@youneed/cli-middleware-prompt";

export class ElementsCommand extends Command("elements", {
  description: "Showcase customised prompt elements (run in a real terminal)",
  middleware: [color(), prompts()],
}) {
  override async execute() {
    const c = this.color;
    const steps = ["Title", "Priority", "Create"];

    // stepper as a header — printed before each step, advancing `current`.
    console.log(stepper(steps, { current: 0 }));
    // 1. Input framed in a box (custom title).
    const title = await this.prompt.ask("Issue title", {
      box: "New issue",
      default: "Fix the bug",
    });

    console.log(stepper(steps, { current: 1 }));
    // 2. A custom-rendered single-select list — coloured severity dots, custom pointer.
    const dot = (value: unknown): string =>
      value === "high"
        ? c.red("●")
        : value === "med"
          ? c.yellow("●")
          : c.green("●");
    const priority = await this.prompt.choice(
      "Priority",
      [
        { label: "Low", value: "low", hint: "someday" },
        { label: "Medium", value: "med" },
        { label: "High", value: "high", hint: "now!" },
      ],
      {
        format: (item: ChoiceItem<unknown>, { active }) =>
          `${active ? c.cyan("▸") : " "} ${dot(item.value)} ${active ? c.bold(c.cyan(item.label)) : item.label}` +
          (item.hint ? "  " + c.dim(item.hint) : ""),
      },
    );

    console.log(stepper(steps, { current: 2 }));
    // 3. A spinner around async work.
    const id = await this.prompt.spinner("Creating issue…", async () => {
      await new Promise((r) => setTimeout(r, 1200));
      return Math.floor(Math.random() * 900) + 100;
    });

    await this.prompt.alert(c.green(`✓ #${id} — ${title} [${priority}]`));
  }
}
