import { afterEach, describe, expect, test } from "bun:test";
import { PortalSession } from "./client";

const originalFetch = globalThis.fetch;

afterEach(() => {
  (globalThis as any).fetch = originalFetch;
});

describe("PortalSession.resolveBuyTicketUrl", () => {
  test("posts ticket criteria and returns direct redirect urls", async () => {
    let requestBody = "";
    (globalThis as any).fetch = async (_input: string | URL | Request, init?: RequestInit) => {
      requestBody = String(init?.body ?? "");
      return new Response(JSON.stringify({ redirectType: 2, url: "https://bilkom.pl/podroz/foo" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };

    const session = new PortalSession() as any;
    session.token = "csrf-token";

    const result = await session.resolveBuyTicketUrl("BUY_STANDARD");

    expect(result).toBe("https://bilkom.pl/podroz/foo");
    expect(requestBody).toContain("kryteria=BUY_STANDARD");
    expect(requestBody).toContain("contrast=0");
    expect(requestBody).toContain("__RequestVerificationToken=csrf-token");
  });

  test("returns null for non-direct redirects", async () => {
    (globalThis as any).fetch = async () =>
      new Response(JSON.stringify({ redirectType: 1, url: "https://bilkom.pl/podroz/foo" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });

    const session = new PortalSession() as any;
    session.token = "csrf-token";

    await expect(session.resolveBuyTicketUrl("BUY_STANDARD")).resolves.toBeNull();
  });
});
