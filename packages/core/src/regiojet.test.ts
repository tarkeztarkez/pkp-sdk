import { afterEach, describe, expect, test } from "bun:test";
import { fetchRegioJetRoutePrice, parseRegioJetRedirect, regioJetTariffForDiscount } from "./regiojet";

const originalFetch = globalThis.fetch;

afterEach(() => {
  (globalThis as any).fetch = originalFetch;
});

describe("regioJetTariffForDiscount", () => {
  test("maps 51 discount to PL_STUDENT", () => {
    expect(regioJetTariffForDiscount(51)).toBe("PL_STUDENT");
  });

  test("keeps regular tariff for other discounts", () => {
    expect(regioJetTariffForDiscount(0)).toBe("REGULAR");
    expect(regioJetTariffForDiscount(30)).toBe("REGULAR");
  });
});

describe("parseRegioJetRedirect", () => {
  test("reads route search params and rewrites tariff from discount", () => {
    expect(parseRegioJetRedirect(
      "https://regiojet.pl/?departureDate=2026-04-06&tariffs=REGULAR&fromLocationId=7998876001&fromLocationType=STATION&toLocationId=7998876003&toLocationType=STATION",
      51,
    )).toEqual({
      origin: "https://regiojet.pl",
      fromLocationId: "7998876001",
      fromLocationType: "STATION",
      toLocationId: "7998876003",
      toLocationType: "STATION",
      departureDate: "2026-04-06",
      tariff: "PL_STUDENT",
    });
  });
});

describe("fetchRegioJetRoutePrice", () => {
  test("matches an exact route and builds the fare link", async () => {
    let requestedUrl = "";
    (globalThis as any).fetch = async (input: string | URL | Request) => {
      requestedUrl = String(input);
      return new Response(JSON.stringify({
        routes: [
          {
            id: "8393571391",
            departureStationId: 7998876001,
            departureTime: "2026-04-06T16:08:00.000+02:00",
            arrivalStationId: 7998876003,
            arrivalTime: "2026-04-06T18:00:00.000+02:00",
            priceFrom: 23.3,
          },
        ],
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };

    const result = await fetchRegioJetRoutePrice({
      redirectUrl: "https://regiojet.pl/?departureDate=2026-04-06&tariffs=REGULAR&fromLocationId=7998876001&fromLocationType=STATION&toLocationId=7998876003&toLocationType=STATION",
      departureDate: "06.04.2026",
      departureTime: "16:08",
      arrivalDate: "06.04.2026",
      arrivalTime: "18:00",
      discount: 51,
    });

    expect(requestedUrl).toContain("tariffs=PL_STUDENT");
    expect(result).toEqual({
      routeId: "8393571391",
      fromStationId: "7998876001",
      toStationId: "7998876003",
      ticketPrice: 23.3,
      ticketPriceCurrency: "PLN",
      regiojetBuyLink: "https://regiojet.pl/reservation/fare/there?routeId=8393571391&fromStationId=7998876001&toStationId=7998876003&tariffs=PL_STUDENT",
    });
  });

  test("returns null when no exact route match is found", async () => {
    (globalThis as any).fetch = async () => new Response(JSON.stringify({
      routes: [
        {
          id: "8393571391",
          departureStationId: 7998876001,
          departureTime: "2026-04-06T16:10:00.000+02:00",
          arrivalStationId: 7998876003,
          arrivalTime: "2026-04-06T18:00:00.000+02:00",
          priceFrom: 23.3,
        },
      ],
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });

    await expect(fetchRegioJetRoutePrice({
      redirectUrl: "https://regiojet.pl/?departureDate=2026-04-06&tariffs=REGULAR&fromLocationId=7998876001&fromLocationType=STATION&toLocationId=7998876003&toLocationType=STATION",
      departureDate: "06.04.2026",
      departureTime: "16:08",
      arrivalDate: "06.04.2026",
      arrivalTime: "18:00",
      discount: 0,
    })).resolves.toBeNull();
  });
});
