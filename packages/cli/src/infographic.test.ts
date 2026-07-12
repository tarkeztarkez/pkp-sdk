import { describe, expect, test } from "bun:test";
import {
  buildRoutesInfographicPrompt,
  extractInlineImagePart,
  resolveGeminiApiKey,
} from "./infographic";
import type { RoutesResponse } from "../../core/src";

const sampleResponse: RoutesResponse = {
  ref: "ref-1",
  query: {
    from: "Tarnowskie Góry",
    to: "Warszawa Centralna",
    date: "12.04.2026",
    time: "12:00",
    departureMode: true,
    minChangeMinutes: 10,
    direct: false,
    maxPrice: null,
  },
  count: 2,
  routes: [
    {
      departureStation: "Tarnowskie Góry",
      departurePlatform: "1",
      departureDate: "12.04.2026",
      departureTime: "15:34",
      arrivalStation: "Warszawa Centralna",
      arrivalPlatform: "2",
      arrivalDate: "12.04.2026",
      arrivalTime: "18:00",
      carrier: "RegioJet",
      trainNumber: "41023",
      category: "RJ",
      relation: "Tarnowskie Góry - Warszawa",
      duration: "2h25",
      transfers: 0,
      detailsUrl: "https://portalpasazera.pl/details/1",
      bilkomBuyLink: null,
      regiojetBuyLink: "https://regiojet.com/1",
      ticketPrice: null,
      ticketPriceCurrency: null,
      ticketPriceSource: null,
      ticketPriceAvailable: false,
    },
    {
      departureStation: "Tarnowskie Góry",
      departurePlatform: "1",
      departureDate: "12.04.2026",
      departureTime: "16:54",
      arrivalStation: "Warszawa Centralna",
      arrivalPlatform: "3",
      arrivalDate: "12.04.2026",
      arrivalTime: "19:44",
      carrier: "PKP Intercity",
      trainNumber: "4207",
      category: "IC",
      relation: "Tarnowskie Góry - Warszawa",
      duration: "2h50",
      transfers: 1,
      detailsUrl: "https://portalpasazera.pl/details/2",
      bilkomBuyLink: "https://bilkom.pl/2",
      regiojetBuyLink: null,
      ticketPrice: 32.72,
      ticketPriceCurrency: "PLN",
      ticketPriceSource: "bilkom",
      ticketPriceAvailable: true,
    },
  ],
};

describe("infographic helper", () => {
  test("builds a prompt with assumptions and route data", () => {
    const prompt = buildRoutesInfographicPrompt(sampleResponse, { discount: 51 });

    expect(prompt).toContain("ulga 51%");
    expect(prompt).toContain("Tarnowskie Góry -> Warszawa Centralna");
    expect(prompt).toContain("1. 15:34 -> 18:00");
    expect(prompt).toContain("Cena: 32,72 PLN");
  });

  test("extracts inline image data", () => {
    expect(extractInlineImagePart({
      candidates: [
        {
          content: {
            parts: [
              { text: "ignored" },
              { inlineData: { mimeType: "image/png", data: "Zm9v" } },
            ],
          },
        },
      ],
    })).toEqual({
      mimeType: "image/png",
      data: "Zm9v",
    });
  });

  test("prefers GEMINI_API_KEY from env", () => {
    expect(resolveGeminiApiKey({ GEMINI_API_KEY: "test-key" })).toBe("test-key");
  });
});
