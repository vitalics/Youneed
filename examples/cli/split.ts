import { Command, defaultOptions, option, t } from "@youneed/cli";
import { color } from "@youneed/cli-middleware-color";
import { logger } from "@youneed/cli-middleware-logger";

// Reusable option descriptors — first-class values, like server guards.
const first = option("-f, --first", {
  description: "display just the first substring",
});
const separator = option("-s, --separator <char>", {
  description: "separator character",
  schema: t.string(),
  default: ",",
});

export class SplitCommand extends Command("split <string>", {
  description: "Split a string into substrings and display as an array",
  options: [first, separator, { name: "-v, --verbose" }, ...defaultOptions()],
  middleware: [color(), logger()],
}) {
  override execute(value: string) {
    const limit = this.options.first ? 1 : undefined;
    const parts = value.split(this.options.separator, limit);
    this.logger.info("split complete", { parts: parts.length });
    console.log(this.color.cyan(JSON.stringify(parts)));
  }
}
