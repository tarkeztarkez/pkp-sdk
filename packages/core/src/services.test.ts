import { describe, expect, test } from "bun:test";
import { applyDiscountToTicketPrice, parsePortalBuyOffers, searchRoutes } from "./services";

describe("applyDiscountToTicketPrice", () => {
  test("keeps the base price for 0 percent discount", () => {
    expect(applyDiscountToTicketPrice(49.99, 0)).toBe(49.99);
  });

  test("applies a percentage discount and rounds to two decimals", () => {
    expect(applyDiscountToTicketPrice(49.99, 51)).toBe(24.5);
  });

  test("supports a full 100 percent discount", () => {
    expect(applyDiscountToTicketPrice(49.99, 100)).toBe(0);
  });

  test("keeps missing prices as null", () => {
    expect(applyDiscountToTicketPrice(null, 51)).toBeNull();
  });
});

describe("searchRoutes discount validation", () => {
  test("rejects discounts below zero", async () => {
    await expect(searchRoutes({ from: "A", to: "B", discount: -1 })).rejects.toThrow("Invalid discount");
  });

  test("rejects discounts above one hundred", async () => {
    await expect(searchRoutes({ from: "A", to: "B", discount: 101 })).rejects.toThrow("Invalid discount");
  });
});

describe("searchRoutes maxPrice validation", () => {
  test("rejects maxPrice below zero", async () => {
    await expect(searchRoutes({ from: "A", to: "B", maxPrice: -1 })).rejects.toThrow("Invalid maxPrice");
  });
});

describe("parsePortalBuyOffers", () => {
  test("extracts active mixed-route offers and reuses route dates", () => {
    expect(parsePortalBuyOffers(
      "2;Katowice;pl-PL;14:57;Zawiercie;pl-PL;15:52;KS|RJ-IGNORE&note#1;Zawiercie;pl-PL;16:08;Warszawa Centralna;pl-PL;18:00;RJ|RJ-ACTIVE&note#",
      { departureDate: "06.04.2026", arrivalDate: "06.04.2026" },
    )).toEqual([
      {
        key: "Katowice|06.04.2026|14:57|Zawiercie|06.04.2026|15:52|KS|0",
        departureStation: "Katowice",
        departureDate: "06.04.2026",
        departureTime: "14:57",
        arrivalStation: "Zawiercie",
        arrivalDate: "06.04.2026",
        arrivalTime: "15:52",
        carrierCodes: ["KS"],
        transfers: 0,
        primaryCategory: "KS",
        primaryTrainNumber: "",
        buyTicketIds: ["RJ-IGNORE"],
      },
      {
        key: "Zawiercie|06.04.2026|16:08|Warszawa Centralna|06.04.2026|18:00|RJ|0",
        departureStation: "Zawiercie",
        departureDate: "06.04.2026",
        departureTime: "16:08",
        arrivalStation: "Warszawa Centralna",
        arrivalDate: "06.04.2026",
        arrivalTime: "18:00",
        carrierCodes: ["RJ"],
        transfers: 0,
        primaryCategory: "RJ",
        primaryTrainNumber: "",
        buyTicketIds: ["RJ-ACTIVE"],
      },
    ]);
  });

  test("rolls dates forward when a leg crosses midnight", () => {
    expect(parsePortalBuyOffers(
      "1;A;pl-PL;23:50;B;pl-PL;00:20;RJ|ONE#1;B;pl-PL;00:40;C;pl-PL;01:10;RJ|TWO#",
      { departureDate: "06.04.2026", arrivalDate: "07.04.2026" },
    )).toEqual([
      expect.objectContaining({
        departureDate: "06.04.2026",
        arrivalDate: "07.04.2026",
      }),
      expect.objectContaining({
        departureDate: "07.04.2026",
        arrivalDate: "07.04.2026",
      }),
    ]);
  });
});
