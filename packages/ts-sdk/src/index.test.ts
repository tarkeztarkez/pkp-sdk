import { describe, expect, test } from "bun:test";
import { PkpSdk, createPkpSdk, searchStations } from "./index";

describe("pkp-sdk", () => {
  test("exposes the thin wrapper and direct functions", () => {
    const sdk = createPkpSdk();

    expect(sdk).toBeInstanceOf(PkpSdk);
    expect(typeof sdk.searchStations).toBe("function");
    expect(typeof searchStations).toBe("function");
  });
});
