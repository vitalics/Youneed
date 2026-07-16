import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import { Application, Command } from "@youneed/cli";
import { createOscillator, oscillator, spectrumBars, type Oscillator } from "../src/index.ts";

const plain = (s: string): string => s.replace(/\x1b\[[0-9;]*m/g, "");

class OscillatorSuite extends Test({ name: "cli-middleware-oscillator" }) {
  @Test.it("samples are deterministic and within 0..1")
  sampling() {
    const osc = createOscillator({ bands: 8 });
    const a = osc.sample(1.5);
    const b = osc.sample(1.5);
    expect(a.length).toBe(8);
    expect(a).toEqual(b); // deterministic for the same time
    expect(a.every((v) => v >= 0 && v <= 1)).toBe(true);
    // Different times generally differ.
    expect(osc.sample(0)).not.toEqual(osc.sample(2));
  }

  @Test.it("spectrumBars renders height rows of block bars")
  bars() {
    const out = plain(spectrumBars([0, 1], { height: 2 }));
    expect(out).toBe(" █\n █");
  }

  @Test.it("spectrumBars fills proportionally to the value")
  partial() {
    // value 0.5 over height 4 → top rows empty, bottom rows filled.
    const rows = plain(spectrumBars([0.5], { height: 4 })).split("\n");
    expect(rows.length).toBe(4);
    expect(rows[0]).toBe(" "); // top row empty
    expect(rows[3]).toBe("█"); // bottom row full
  }

  @Test.it("spectrumBars applies a colour transform to non-empty cells")
  coloured() {
    const out = spectrumBars([1], { height: 1, color: (cell) => `<${cell}>` });
    expect(out).toBe("<█>");
  }

  @Test.it("contributes this.oscillator to a command")
  contributes() {
    let captured: Oscillator | undefined;
    class Vis extends Command("vis", { middleware: [oscillator({ bands: 16 })] }) {
      execute() {
        captured = this.oscillator;
      }
    }
    const app = Application({ name: "t", commands: [Vis], autoRun: false, stdout() {}, stderr() {} });
    return app.run(["vis"]).then(() => {
      expect(captured?.bands).toBe(16);
      expect(captured?.sample(0).length).toBe(16);
    });
  }
}

await TestApplication().addTests(OscillatorSuite).reporter(new ConsoleReporter()).run();
