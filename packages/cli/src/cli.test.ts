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

  test("help documents the discount flag", async () => {
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

    expect(logs.join("\n")).toContain("--discount PERCENT");
  });

  test("help documents the max-price flag", async () => {
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

    expect(logs.join("\n")).toContain("--max-price PLN");
  });

  test("help documents the infographic flag", async () => {
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

    expect(logs.join("\n")).toContain("--infographic PATH");
  });

  test("rejects an invalid discount flag", async () => {
    const errors: string[] = [];
    const originalError = console.error;

    console.error = (...args: unknown[]) => {
      errors.push(args.map(String).join(" "));
    };

    try {
      await runCli(["routes", "--from", "Warszawa Centralna", "--to", "Kraków Główny", "--discount", "abc"]);
    } finally {
      console.error = originalError;
      process.exitCode = 0;
    }

    expect(errors.join("\n")).toContain("Invalid --discount");
  });

  test("rejects an invalid max-price flag", async () => {
    const errors: string[] = [];
    const originalError = console.error;

    console.error = (...args: unknown[]) => {
      errors.push(args.map(String).join(" "));
    };

    try {
      await runCli(["routes", "--from", "Warszawa Centralna", "--to", "Kraków Główny", "--max-price", "abc"]);
    } finally {
      console.error = originalError;
      process.exitCode = 0;
    }

    expect(errors.join("\n")).toContain("Invalid --max-price");
  });
});
