import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import { Application, Command } from "@youneed/cli";
import { createPlayer, formatTime, music, type PlayerBackend, type Track } from "../src/index.ts";

const TRACK: Track = { title: "Strobe", artist: "deadmau5", duration: 10 };

class TransportSuite extends Test({ name: "cli-middleware-music: transport" }) {
  @Test.it("tick advances elapsed only while playing")
  ticks() {
    const p = createPlayer(TRACK);
    expect(p.playing).toBe(false);
    p.tick(3);
    expect(p.elapsed).toBe(0); // paused → no advance
    p.play();
    p.tick(3);
    expect(p.elapsed).toBe(3);
    expect(p.progress).toBe(0.3);
    p.pause();
    p.tick(5);
    expect(p.elapsed).toBe(3); // paused again
  }

  @Test.it("ends at duration and stops playing")
  ends() {
    const p = createPlayer(TRACK);
    p.play();
    p.tick(100);
    expect(p.elapsed).toBe(10);
    expect(p.ended).toBe(true);
    expect(p.playing).toBe(false);
  }

  @Test.it("seek clamps within the track")
  seeks() {
    const p = createPlayer(TRACK);
    p.seek(4);
    expect(p.elapsed).toBe(4);
    p.seek(999);
    expect(p.elapsed).toBe(10);
    p.seek(-5);
    expect(p.elapsed).toBe(0);
  }

  @Test.it("toggle flips play/pause")
  toggles() {
    const p = createPlayer(TRACK);
    p.toggle();
    expect(p.playing).toBe(true);
    p.toggle();
    expect(p.playing).toBe(false);
  }

  @Test.it("drives the backend on play / pause / end")
  backend() {
    const events: string[] = [];
    const backend: PlayerBackend = {
      play: () => events.push("play"),
      pause: () => events.push("pause"),
      stop: () => events.push("stop"),
    };
    const p = createPlayer(TRACK, { backend });
    p.play();
    p.pause();
    p.play();
    p.tick(100); // reaches the end → stop
    expect(events).toEqual(["play", "pause", "play", "stop"]);
  }
}

class FormatSuite extends Test({ name: "cli-middleware-music: formatTime" }) {
  @Test.it("formats seconds as m:ss")
  format() {
    expect(formatTime(0)).toBe("0:00");
    expect(formatTime(5)).toBe("0:05");
    expect(formatTime(65)).toBe("1:05");
    expect(formatTime(125)).toBe("2:05");
  }
}

class MiddlewareSuite extends Test({ name: "cli-middleware-music: middleware" }) {
  @Test.it("contributes this.player and honours autoplay")
  contributes() {
    let playing = false;
    class Play extends Command("play", { middleware: [music(TRACK, { autoplay: true })] }) {
      execute() {
        this.player.tick(2);
        playing = this.player.playing;
      }
    }
    const app = Application({ name: "t", commands: [Play], autoRun: false, stdout() {}, stderr() {} });
    return app.run(["play"]).then(() => {
      expect(playing).toBe(true);
    });
  }
}

await TestApplication()
  .addTests(TransportSuite)
  .addTests(FormatSuite)
  .addTests(MiddlewareSuite)
  .reporter(new ConsoleReporter())
  .run();
