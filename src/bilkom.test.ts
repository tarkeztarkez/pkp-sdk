import { describe, expect, test } from "bun:test";
import { buildBilkomRouteKey, parseBilkomJourneys } from "./bilkom";
import { startServer } from "./server";

describe("buildBilkomRouteKey", () => {
  test("normalizes portal and bilkom date tokens into the same key", () => {
    const portalKey = buildBilkomRouteKey({
      departureDate: "31.03.2026",
      departureTime: "17:36",
      arrivalDate: "31.03.2026",
      arrivalTime: "20:16",
      transfers: 0,
      category: "IC",
      trainNumber: "110",
    });
    const bilkomKey = buildBilkomRouteKey({
      departureDate: "31-03-2026 17:36 CEST",
      departureTime: "17:36",
      arrivalDate: "31-03-2026 20:16 CEST",
      arrivalTime: "20:16",
      transfers: 0,
      category: "ic",
      trainNumber: "110",
    });

    expect(portalKey).toBe(bilkomKey);
  });
});

describe("parseBilkomJourneys", () => {
  test("extracts a price request and route key from Bilkom list HTML", () => {
    const journeys = parseBilkomJourneys(`
      <ul id="trips">
        <li class="el" data-trip-id="TRIP-1">
          <div class="mobile-carrier carrier-metadata"
            data-partoftrip="PART-1"
            data-number="110"
            data-carrierid="IC"
            data-startdate="31-03-2026 17:36 CEST"
            data-arrivaldate="31-03-2026 20:16 CEST"
            data-departure="5100065"
            data-arrival="5100020"
            data-stations="5100065;5100020"
            data-partoftripobj='{"id":"PART-1","num":"110"}'></div>
        </li>
      </ul>
    `);

    expect(journeys).toHaveLength(1);
    expect(journeys[0]?.routeKey).toBe("31.03.2026|17:36|31.03.2026|20:16|0|IC|110");
    expect(journeys[0]?.request.tripId).toBe("TRIP-1");
    expect(journeys[0]?.request.offeredTrains[0]?.stationIds).toEqual(["5100065", "5100020"]);
  });
});

describe("server openapi", () => {
  test("documents the route price fields", async () => {
    const port = 32123;
    const server = startServer({ host: "127.0.0.1", port });

    try {
      const response = await fetch(`http://127.0.0.1:${port}/openapi.json`);
      const json = (await response.json()) as any;
      const routeSchema = json.components.schemas.Route;

      expect(routeSchema.properties.ticketPrice.type).toEqual(["number", "null"]);
      expect(routeSchema.properties.ticketPriceCurrency.enum).toEqual(["PLN", null]);
      expect(routeSchema.properties.ticketPriceSource.enum).toEqual(["bilkom", null]);
      expect(routeSchema.required).toContain("ticketPriceAvailable");
    } finally {
      server.stop(true);
    }
  });
});
