import { load } from "cheerio";

const BILKOM_BASE_URL = "https://bilkom.pl";
const DEFAULT_CARRIER_KEYS = "PZ,P2,P3,P1,P5,P7,P9,P0,O1,P4";
const DEFAULT_TRAIN_GROUP_KEYS = "G.EXPRESS_TRAINS,G.FAST_TRAINS,G.REGIONAL_TRAINS";

type BilkomStation = {
  id: string;
  name: string;
  extId: string;
};

type BilkomJourneyLeg = {
  trainNumber: string;
  category: string;
  departureTime: string;
  arrivalTime: string;
};

type BilkomJourneyPriceRequest = {
  id: string;
  tripId: string;
  offeredTrains: Array<{
    partOfTripId: string;
    partOfTrip: unknown;
    trainNumber: string;
    carrier: {
      shortName: string;
    };
    departureDate: string;
    arrivalDate: string;
    departureStationCode: {
      hafasId: string;
    };
    arrivalStationCode: {
      hafasId: string;
    };
    stationIds: string[];
  }>;
};

type BilkomPriceResponse = {
  journeyPrices?: Array<{
    id?: string;
    totalPrice?: number;
    wbNetTotalPrice?: number;
    useWbNetPrice?: boolean;
    skipPrice?: boolean;
    errorCode?: Array<{
      errorCode?: number;
    }>;
  }>;
};

export type BilkomRoutePrice = {
  routeKey: string;
  ticketPrice: number | null;
  ticketPriceCurrency: "PLN" | null;
  ticketPriceSource: "bilkom" | null;
  ticketPriceAvailable: boolean;
};

type BilkomJourneyCandidate = {
  routeKey: string;
  request: BilkomJourneyPriceRequest;
};

export async function fetchBilkomRoutePrices(input: {
  from: string;
  to: string;
  date: string;
  time: string;
  departureMode: boolean;
  minChangeMinutes: number;
  direct: boolean;
}): Promise<BilkomRoutePrice[]> {
  const [fromStation, toStation] = await Promise.all([
    searchBilkomStation(input.from, "FROMSTATION"),
    searchBilkomStation(input.to, "TOSTATION"),
  ]);

  const html = await fetchBilkomSearchPage({
    from: fromStation,
    to: toStation,
    date: input.date,
    time: input.time,
    departureMode: input.departureMode,
    minChangeMinutes: input.minChangeMinutes,
    direct: input.direct,
  });

  const journeys = parseBilkomJourneys(html);
  if (journeys.length === 0) {
    return [];
  }

  const priceResponse = await fetchBilkomJourneyPrices(journeys.map((journey) => journey.request));
  const pricesById = new Map(
    (priceResponse.journeyPrices ?? [])
      .filter((item) => typeof item.id === "string")
      .map((item) => [item.id as string, normalizeBilkomPrice(item)]),
  );

  return journeys.map((journey) => {
    const price = pricesById.get(journey.request.id) ?? null;
    return {
      routeKey: journey.routeKey,
      ticketPrice: price,
      ticketPriceCurrency: price === null ? null : "PLN",
      ticketPriceSource: price === null ? null : "bilkom",
      ticketPriceAvailable: price !== null,
    };
  });
}

export function buildBilkomRouteKey(input: {
  departureDate: string;
  departureTime: string;
  arrivalDate: string;
  arrivalTime: string;
  transfers: number;
  category: string;
  trainNumber: string;
}): string {
  const departureDate = normalizeDateToken(input.departureDate);
  const arrivalDate = normalizeDateToken(input.arrivalDate);
  const departureTime = normalizeTimeToken(input.departureTime);
  const arrivalTime = normalizeTimeToken(input.arrivalTime);
  const category = normalizeRouteToken(input.category);
  const trainNumber = normalizeRouteToken(input.trainNumber);

  return [
    departureDate,
    departureTime,
    arrivalDate,
    arrivalTime,
    String(input.transfers),
    category,
    trainNumber,
  ].join("|");
}

export function parseBilkomJourneys(html: string): BilkomJourneyCandidate[] {
  const $ = load(html);

  return $("#trips > li.el")
    .toArray()
    .map((element, index) => {
      const item = $(element);
      const journeyId = item.attr("data-id") || String(index);
      const tripId = item.attr("data-trip-id") || "";
      const carrierNodes = uniqueCarrierMetadataNodes($, item);
      const legs = carrierNodes.map((node) => parseBilkomLeg(node));
      const request = buildBilkomJourneyPriceRequest($, item, journeyId, tripId);

      if (legs.length === 0 || !request) {
        return null;
      }

      const first = legs[0];
      const last = legs[legs.length - 1];
      if (!first || !last) {
        return null;
      }

      return {
        routeKey: buildBilkomRouteKey({
          departureDate: extractDateToken(request.offeredTrains[0]?.departureDate || ""),
          departureTime: first.departureTime,
          arrivalDate: extractDateToken(request.offeredTrains[request.offeredTrains.length - 1]?.arrivalDate || ""),
          arrivalTime: last.arrivalTime,
          transfers: Math.max(legs.length - 1, 0),
          category: legs.length === 1 ? first.category : "",
          trainNumber: legs.length === 1 ? first.trainNumber : "",
        }),
        request,
      };
    })
    .filter((item): item is BilkomJourneyCandidate => item !== null);
}

function buildBilkomJourneyPriceRequest(
  $: ReturnType<typeof load>,
  item: ReturnType<ReturnType<typeof load>>,
  id: string,
  tripId: string,
): BilkomJourneyPriceRequest | null {
  const offeredTrains = uniqueCarrierMetadataNodes($, item)
    .map((data) => {
      const partOfTrip = data.attr("data-partoftripobj");
      if (!partOfTrip) {
        return null;
      }

      return {
        partOfTripId: data.attr("data-partoftrip") || "",
        partOfTrip: JSON.parse(partOfTrip),
        trainNumber: data.attr("data-number") || "",
        carrier: {
          shortName: data.attr("data-carrierid") || "",
        },
        departureDate: data.attr("data-startdate") || "",
        arrivalDate: data.attr("data-arrivaldate") || "",
        departureStationCode: {
          hafasId: data.attr("data-departure") || "",
        },
        arrivalStationCode: {
          hafasId: data.attr("data-arrival") || "",
        },
        stationIds: (data.attr("data-stations") || "")
          .split(";")
          .map((part) => part.trim())
          .filter(Boolean),
      };
    })
    .filter((value): value is BilkomJourneyPriceRequest["offeredTrains"][number] => value !== null);

  if (offeredTrains.length === 0) {
    return null;
  }

  return { id, tripId, offeredTrains };
}

function uniqueCarrierMetadataNodes(
  $: ReturnType<typeof load>,
  item: ReturnType<ReturnType<typeof load>>,
) {
  const seen = new Set<string>();

  return item
    .find(".carrier-metadata")
    .toArray()
    .map((node) => $(node))
    .filter((node) => {
      const key = node.attr("data-partoftrip") || `${node.attr("data-number")}|${node.attr("data-startdate")}`;
      if (!key || seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
}

function parseBilkomLeg(node: ReturnType<ReturnType<typeof load>>): BilkomJourneyLeg {
  return {
    trainNumber: cleanToken(node.attr("data-number")),
    category: cleanToken(node.attr("data-carrierid")),
    departureTime: extractTimeToken(node.attr("data-startdate") || ""),
    arrivalTime: extractTimeToken(node.attr("data-arrivaldate") || ""),
  };
}

async function fetchBilkomJourneyPrices(requests: BilkomJourneyPriceRequest[]): Promise<BilkomPriceResponse> {
  const response = await fetch(`${BILKOM_BASE_URL}/podroz/ceny`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ journeyPrices: requests }),
  });

  if (!response.ok) {
    throw new Error(`Bilkom price lookup failed with status ${response.status}.`);
  }

  return (await response.json()) as BilkomPriceResponse;
}

async function fetchBilkomSearchPage(input: {
  from: BilkomStation;
  to: BilkomStation;
  date: string;
  time: string;
  departureMode: boolean;
  minChangeMinutes: number;
  direct: boolean;
}) {
  const url = new URL("/podroz", BILKOM_BASE_URL);
  url.searchParams.set("basketKey", "");
  url.searchParams.set("carrierKeys", DEFAULT_CARRIER_KEYS);
  url.searchParams.set("trainGroupKeys", DEFAULT_TRAIN_GROUP_KEYS);
  url.searchParams.set("returnForOrderKey", "");
  url.searchParams.set("fromStation", input.from.name);
  url.searchParams.set("poczatkowa", input.from.id);
  url.searchParams.set("toStation", input.to.name);
  url.searchParams.set("docelowa", input.to.id);
  url.searchParams.set("middleStation1", "");
  url.searchParams.set("posrednia1", "");
  url.searchParams.set("posrednia1czas", "");
  url.searchParams.set("middleStation2", "");
  url.searchParams.set("posrednia2", "");
  url.searchParams.set("posrednia2czas", "");
  url.searchParams.set("data", bilkomTripDate(input.date, input.time));
  url.searchParams.set("date", bilkomDateDisplay(input.date));
  url.searchParams.set("time", input.time);
  url.searchParams.set("minChangeTime", bilkomMinChangeValue(input.minChangeMinutes));
  url.searchParams.set("przyjazd", String(!input.departureMode));
  url.searchParams.set("bilkomAvailOnly", "on");
  url.searchParams.set("_csrf", "");

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Bilkom route lookup failed with status ${response.status}.`);
  }

  return await response.text();
}

async function searchBilkomStation(query: string, source: "FROMSTATION" | "TOSTATION"): Promise<BilkomStation> {
  const url = new URL("/stacje/szukaj", BILKOM_BASE_URL);
  url.searchParams.set("q", query);
  url.searchParams.set("source", source);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Bilkom station search failed with status ${response.status}.`);
  }

  const payload = (await response.json()) as { stations?: Array<{ id?: string; name?: string; extId?: string }> };
  const stations = payload.stations ?? [];
  const exact = stations.find((item) => cleanToken(item.name) === cleanToken(query));
  const best = exact ?? stations[0];

  if (!best?.id || !best.name || !best.extId) {
    throw new Error(`Bilkom did not return a station match for "${query}".`);
  }

  return {
    id: best.id,
    name: best.name,
    extId: best.extId,
  };
}

function normalizeBilkomPrice(item: NonNullable<BilkomPriceResponse["journeyPrices"]>[number]) {
  if (item.skipPrice) {
    return null;
  }

  const cents = item.useWbNetPrice ? item.wbNetTotalPrice : item.totalPrice;
  if (typeof cents !== "number" || cents <= 0) {
    return null;
  }

  return Number((cents / 100).toFixed(2));
}

function bilkomTripDate(date: string, time: string) {
  const [day, month, year] = date.split(".");
  return `${day}${month}${year}${time.replace(":", "")}`;
}

function bilkomDateDisplay(date: string) {
  const [day, month, year] = date.split(".");
  return `${day}/${month}/${year}`;
}

function bilkomMinChangeValue(minChangeMinutes: number) {
  if (minChangeMinutes >= 30) {
    return "30";
  }
  if (minChangeMinutes >= 20) {
    return "20";
  }
  if (minChangeMinutes >= 10) {
    return "10";
  }
  return "";
}

function extractTimeToken(value: string) {
  return cleanToken(value.match(/(\d{2}:\d{2})/)?.[1] ?? "");
}

function extractDateToken(value: string) {
  const match = value.match(/(\d{2})-(\d{2})-(\d{4})/);
  if (!match) {
    return cleanToken(value);
  }
  return `${match[1]}.${match[2]}.${match[3]}`;
}

function normalizeDateToken(value: string) {
  const trimmed = cleanToken(value);
  if (/^\d{2}\.\d{2}\.\d{4}$/.test(trimmed)) {
    return trimmed;
  }

  const match = trimmed.match(/(\d{2})[.\-/ ](\d{2})[.\-/ ](\d{4})/);
  if (!match) {
    return trimmed;
  }

  return `${match[1]}.${match[2]}.${match[3]}`;
}

function normalizeTimeToken(value: string) {
  return cleanToken(value.match(/\d{2}:\d{2}/)?.[0] ?? value);
}

function normalizeRouteToken(value: string) {
  return cleanToken(value).toUpperCase();
}

function cleanToken(value: string | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}
