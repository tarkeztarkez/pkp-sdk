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

export type BilkomGrmJourney = {
  stationFrom: string;
  stationTo: string;
  stationNumberingSystem: "HAFAS";
  vehicleNumber: string;
  departureDate: string;
  arrivalDate: string;
  category: string;
};

export type BilkomGrmTrainComposition = {
  pojazdTyp: string;
  pojazdNazwa: string;
  wagony: number[];
  wagonyUdogodnienia: Record<string, string[]>;
  klasa0: number[];
  klasa1: number[];
  klasa2: number[];
  kierunekJazdy: number;
  zmieniaKierunek: boolean;
  wagonySchemat: Record<string, string>;
  klasaDomyslnyWagon: Record<string, number>;
  wagonyNiedostepne: number[];
};

export type BilkomGrmCarriageSpot = {
  number: number;
  status: string;
  properties: string[];
  serviceType: string;
};

export type BilkomGrmCarriageSpotStat = {
  serviceType: string;
  trainClass: string;
  type: string;
  noOfAllSpots: number;
  noOfAvailableSpots: number;
  noOfReservedSpots: number;
  noOfBlockedSpots: number;
  occupancyPercent: number;
};

export type BilkomGrmCarriage = {
  serviceType: string;
  additionalServices: string[];
  carriageNumber: number;
  epaType: string;
  compartmentType: string;
  schema: string;
  order: number;
  baseOrder: number;
  spotNumberOrder: string;
  status: string;
  travelPlan: {
    fromStationNumber: number;
    toStationNumber: number;
  } | null;
  spotsStats: BilkomGrmCarriageSpotStat[];
  spots: BilkomGrmCarriageSpot[];
};

export type BilkomGrmCarriagesResponse = {
  hadesResponseInfo: Record<string, unknown> | null;
  vehicle: Record<string, unknown> | null;
  stops: Array<Record<string, unknown>>;
  carriages: BilkomGrmCarriage[];
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

let grmAuthHeaderPromise: Promise<string> | null = null;

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

export async function findBilkomGrmJourney(input: {
  from: string;
  to: string;
  date: string;
  time: string;
  departureMode: boolean;
  minChangeMinutes: number;
  direct: boolean;
  routeKey: string;
  routeTimeKey: string;
}): Promise<BilkomGrmJourney | null> {
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
  const exactMatch = journeys.find((item) => item.routeKey === input.routeKey);
  const timeMatches = journeys.filter((item) => buildBilkomTimeKey(item.routeKey) === input.routeTimeKey);
  const match = exactMatch ?? (timeMatches.length === 1 ? timeMatches[0] : null);
  if (!match) {
    return null;
  }

  const offeredTrain = match.request.offeredTrains[0];
  if (!offeredTrain || match.request.offeredTrains.length !== 1) {
    return null;
  }

  return {
    stationFrom: offeredTrain.departureStationCode.hafasId,
    stationTo: offeredTrain.arrivalStationCode.hafasId,
    stationNumberingSystem: "HAFAS",
    vehicleNumber: offeredTrain.trainNumber,
    departureDate: normalizeBilkomIsoDateTime(offeredTrain.departureDate),
    arrivalDate: normalizeBilkomIsoDateTime(offeredTrain.arrivalDate),
    category: cleanToken(offeredTrain.carrier.shortName).toUpperCase(),
  };
}

export async function fetchBilkomGrmTrainComposition(input: BilkomGrmJourney): Promise<BilkomGrmTrainComposition> {
  const payload = await fetchBilkomGrmJson<Partial<BilkomGrmTrainComposition>>("/grm/sklad", buildBilkomGrmTrainRequest(input));

  return {
    pojazdTyp: cleanToken(payload.pojazdTyp),
    pojazdNazwa: cleanToken(payload.pojazdNazwa),
    wagony: normalizeNumberArray(payload.wagony),
    wagonyUdogodnienia: normalizeStringArrayRecord(payload.wagonyUdogodnienia),
    klasa0: normalizeNumberArray(payload.klasa0),
    klasa1: normalizeNumberArray(payload.klasa1),
    klasa2: normalizeNumberArray(payload.klasa2),
    kierunekJazdy: typeof payload.kierunekJazdy === "number" ? payload.kierunekJazdy : 0,
    zmieniaKierunek: Boolean(payload.zmieniaKierunek),
    wagonySchemat: normalizeStringRecord(payload.wagonySchemat),
    klasaDomyslnyWagon: normalizeNumberRecord(payload.klasaDomyslnyWagon),
    wagonyNiedostepne: normalizeNumberArray(payload.wagonyNiedostepne),
  };
}

export async function fetchBilkomGrmCarriages(input: BilkomGrmJourney): Promise<BilkomGrmCarriagesResponse> {
  const payload = await fetchBilkomGrmJson<Partial<BilkomGrmCarriagesResponse>>("/grm", {
    ...buildBilkomGrmTrainRequest(input),
    type: "CARRIAGE",
    returnAllSectionsAvailableAtStationFrom: true,
    returnBGMRecordsInfo: false,
  });

  return {
    hadesResponseInfo: isRecord(payload.hadesResponseInfo) ? payload.hadesResponseInfo : null,
    vehicle: isRecord(payload.vehicle) ? payload.vehicle : null,
    stops: Array.isArray(payload.stops) ? payload.stops.filter(isRecord) : [],
    carriages: normalizeBilkomGrmCarriages(payload.carriages),
  };
}

export async function fetchBilkomGrmCarriageSvg(input: BilkomGrmJourney, carriageNumber: number): Promise<string> {
  const response = await fetch(`${BILKOM_BASE_URL}/grm/wagon/schemat/svg/availableIC`, {
    method: "POST",
    headers: {
      authorization: await getBilkomGrmAuthHeader(),
      "content-type": "application/json",
    },
    body: JSON.stringify({
      ...buildBilkomGrmTrainRequest(input),
      carriageNumber,
      category: input.category,
    }),
  });

  if (!response.ok) {
    throw new Error(`Bilkom GRM carriage SVG lookup failed with status ${response.status}.`);
  }

  return await response.text();
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

export function buildBilkomGrmRouteKey(input: {
  departureDate: string;
  departureTime: string;
  arrivalDate: string;
  arrivalTime: string;
  transfers: number;
  category: string;
  trainNumber: string;
}) {
  return buildBilkomRouteKey(input);
}

function buildBilkomTimeKey(routeKey: string) {
  return routeKey.split("|").slice(0, 5).join("|");
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

async function fetchBilkomGrmJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${BILKOM_BASE_URL}${path}`, {
    method: "POST",
    headers: {
      authorization: await getBilkomGrmAuthHeader(),
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Bilkom GRM lookup failed with status ${response.status} for ${path}.`);
  }

  return (await response.json()) as T;
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

async function getBilkomGrmAuthHeader() {
  if (!grmAuthHeaderPromise) {
    grmAuthHeaderPromise = resolveBilkomGrmAuthHeader();
  }

  return await grmAuthHeaderPromise;
}

async function resolveBilkomGrmAuthHeader() {
  const configured = process.env.BILKOM_GRM_BASIC_AUTH?.trim();
  if (configured) {
    return configured.startsWith("Basic ") ? configured : `Basic ${configured}`;
  }

  const indexUrl = `${BILKOM_BASE_URL}/ngx-grm/index.html?v=%204.3`;
  const html = await (await fetch(indexUrl)).text();
  const scriptPath = html.match(/src="([^"]*main\.[^"]+\.js)"/)?.[1];
  if (!scriptPath) {
    throw new Error("Could not discover Bilkom GRM bundle URL.");
  }

  const scriptUrl = new URL(scriptPath, indexUrl).toString();
  const bundle = await (await fetch(scriptUrl)).text();
  const creds = bundle.match(/from\("([^"]+)"\s*,\s*"utf8"\)\.toString\("base64"\)/)?.[1];
  if (!creds) {
    throw new Error("Could not discover Bilkom GRM authorization header.");
  }

  return `Basic ${Buffer.from(creds, "utf8").toString("base64")}`;
}

function buildBilkomGrmTrainRequest(input: BilkomGrmJourney) {
  return {
    stationFrom: input.stationFrom,
    stationTo: input.stationTo,
    stationNumberingSystem: input.stationNumberingSystem,
    vehicleNumber: input.vehicleNumber,
    departureDate: input.departureDate,
    arrivalDate: input.arrivalDate,
  };
}

function normalizeBilkomGrmCarriages(value: unknown): BilkomGrmCarriage[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isRecord).map((item) => ({
    serviceType: cleanToken(asString(item.serviceType)),
    additionalServices: normalizeStringArray(item.additionalServices),
    carriageNumber: asNumber(item.carriageNumber),
    epaType: cleanToken(asString(item.epaType)),
    compartmentType: cleanToken(asString(item.compartmentType)),
    schema: cleanToken(asString(item.schema)),
    order: asNumber(item.order),
    baseOrder: asNumber(item.baseOrder),
    spotNumberOrder: cleanToken(asString(item.spotNumberOrder)),
    status: cleanToken(asString(item.status)),
    travelPlan: isRecord(item.travelPlan)
      ? {
          fromStationNumber: asNumber(item.travelPlan.fromStationNumber),
          toStationNumber: asNumber(item.travelPlan.toStationNumber),
        }
      : null,
    spotsStats: normalizeBilkomGrmSpotStats(item.spotsStats),
    spots: normalizeBilkomGrmSpots(item.spots),
  }));
}

function normalizeBilkomGrmSpots(value: unknown): BilkomGrmCarriageSpot[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isRecord).map((item) => ({
    number: asNumber(item.number),
    status: cleanToken(asString(item.status)),
    properties: normalizeStringArray(item.properties),
    serviceType: cleanToken(asString(item.serviceType)),
  }));
}

function normalizeBilkomGrmSpotStats(value: unknown): BilkomGrmCarriageSpotStat[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isRecord).map((item) => ({
    serviceType: cleanToken(asString(item.serviceType)),
    trainClass: cleanToken(asString(item.trainClass)),
    type: cleanToken(asString(item.type)),
    noOfAllSpots: asNumber(item.noOfAllSpots),
    noOfAvailableSpots: asNumber(item.noOfAvailableSpots),
    noOfReservedSpots: asNumber(item.noOfReservedSpots),
    noOfBlockedSpots: asNumber(item.noOfBlockedSpots),
    occupancyPercent: asNumber(item.occupancyPercent),
  }));
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

function normalizeBilkomIsoDateTime(value: string) {
  const match = value.match(/(\d{2})-(\d{2})-(\d{4}) (\d{2}:\d{2})/);
  if (!match) {
    throw new Error(`Invalid Bilkom date-time: ${value}`);
  }

  return `${match[3]}-${match[2]}-${match[1]}T${match[4]}:00`;
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

function normalizeNumberArray(value: unknown) {
  return Array.isArray(value) ? value.map(asNumber).filter((item) => item > 0) : [];
}

function normalizeStringArray(value: unknown) {
  return Array.isArray(value) ? value.map(asString).map(cleanToken).filter(Boolean) : [];
}

function normalizeStringArrayRecord(value: unknown) {
  if (!isRecord(value)) {
    return {};
  }

  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalizeStringArray(item)]));
}

function normalizeStringRecord(value: unknown) {
  if (!isRecord(value)) {
    return {};
  }

  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cleanToken(asString(item))]));
}

function normalizeNumberRecord(value: unknown) {
  if (!isRecord(value)) {
    return {};
  }

  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, asNumber(item)]));
}

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function asNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
