import { describe, expect, test } from "bun:test";
import { runCli } from "./cli";

describe("runCli", () => {
  test("prints help for help command", async () => {
    const logs: string[] = [];
    const originalLog = console.log;

    console.log = (...args: unknown[]) => {
      logs.push(args.map(String).join(" "));
    };

    try {
      await runCli(["help"]);
    } finally {
      console.log = originalLog;
    }

    expect(logs[0]).toContain("pkp cli");
  });
});
