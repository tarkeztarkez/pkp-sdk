import { PortalSession, type Station } from "./client";
import {
  buildBilkomRouteKey,
  fetchBilkomGrmCarriages,
  fetchBilkomGrmCarriageSvg,
  fetchBilkomGrmTrainComposition,
  fetchBilkomRoutePrices,
  findBilkomGrmJourney,
  type BilkomGrmCarriagesResponse,
  type BilkomGrmTrainComposition,
} from "./bilkom";
import { fetchRegioJetRoutePrice, isRegioJetUrl } from "./regiojet";
import {
  parseDelayResults,
  parseDisruptions,
  parseRoutes,
  parseStationBoard,
} from "./parsers";

export type TicketPriceSource = "bilkom" | "regiojet" | "bilkom+regiojet";

export type StationsResponse = {
  query: string;
  count: number;
  stations: Array<{
    id: number;
    name: string;
    key: string;
    iso: string;
    onRequestStop: boolean;
  }>;
};

export type TrainNumbersResponse = {
  query: string;
  count: number;
  trainNumbers: Array<{
    number: string;
    key: string;
  }>;
};

export type RoutesResponse = {
  ref: string;
  query: {
    from: string;
    to: string;
    date: string;
    time: string;
    departureMode: boolean;
    minChangeMinutes: number;
    direct: boolean;
    maxPrice: number | null;
  };
  count: number;
  routes: Array<
    Omit<ReturnType<typeof parseRoutes>[number], "buyTicketStandardData" | "buyTicketSharedData"> & {
      detailsUrl: string;
      bilkomBuyLink: string | null;
      regiojetBuyLink: string | null;
      ticketPrice: number | null;
      ticketPriceCurrency: "PLN" | null;
      ticketPriceSource: TicketPriceSource | null;
      ticketPriceAvailable: boolean;
    }
  >;
};

export type RouteWithPrice = RoutesResponse["routes"][number];

export type RouteResponse = {
  ref: string;
  query: RoutesResponse["query"];
  count: number;
  route: RouteWithPrice;
  grm?: {
    trainComposition: BilkomGrmTrainComposition;
    carriages: BilkomGrmCarriagesResponse["carriages"];
    vehicle: BilkomGrmCarriagesResponse["vehicle"];
    stops: BilkomGrmCarriagesResponse["stops"];
  };
  carriageSvg?: string;
};

export type StationBoardResponse = {
  station: string;
  board: "departures" | "arrivals";
  page: number;
  count: number;
  entries: ReturnType<typeof parseStationBoard>;
};

export type DelaysResponse = {
  ref: string;
  query:
    | {
        station: string;
        departures: boolean;
      }
    | {
        from: string;
        to: string;
        departures: boolean;
      };
  count: number;
  delays: Array<
    ReturnType<typeof parseDelayResults>[number] & {
      detailsUrl: string;
    }
  >;
};

export type DisruptionsResponse = {
  ref: string;
  station: {
    id: number;
    name: string;
  };
  date: string;
  count: number;
  disruptions: ReturnType<typeof parseDisruptions>;
};

export async function searchStations(query: string): Promise<StationsResponse> {
  const requiredQuery = requireValue(query, "station query");
  const session = new PortalSession();
  await session.init("/");
  const results = await session.searchStations(requiredQuery);

  return {
    query: requiredQuery,
    count: results.length,
    stations: results.map((station) => ({
      id: station.ID,
      name: station.Nazwa,
      key: station.Key,
      iso: station.Iso,
      onRequestStop: station.NZ === "T",
    })),
  };
}

export async function searchTrainNumbers(query: string): Promise<TrainNumbersResponse> {
  const requiredQuery = requireValue(query, "train number query");
  const session = new PortalSession();
  await session.init("/");
  const results = await session.searchTrainNumbers(requiredQuery);

  return {
    query: requiredQuery,
    count: results.length,
    trainNumbers: results.map((item) => ({
      number: item.Numer,
      key: item.Key,
    })),
  };
}

export async function searchRoutes(input: {
  from: string;
  to: string;
  date?: string;
  time?: string;
  arrival?: boolean;
  minChange?: number;
  direct?: boolean;
  discount?: number;
  maxPrice?: number;
}): Promise<RoutesResponse> {
  const from = requireValue(input.from, "from");
  const to = requireValue(input.to, "to");
  const date = normalizeDate(input.date || todayLocalDate());
  const time = normalizeTime(input.time || nowLocalTimeRounded());
  const minChangeMinutes = normalizePositiveInt(input.minChange, 3);
  const discount = normalizeDiscount(input.discount);
  const maxPrice = normalizeMaxPrice(input.maxPrice);
  const departureMode = !Boolean(input.arrival);
  const direct = Boolean(input.direct);

  const session = new PortalSession();
  await session.init("/");

  const fromStation = await resolveStation(session, from);
  const toStation = await resolveStation(session, to);
  const { ref, html } = await session.searchRoutes({
    from: fromStation,
    to: toStation,
    date,
    time,
    departureMode,
    minChangeMinutes,
    direct,
  });

  const results = parseRoutes(html);
  const bilkomPrices = await fetchBilkomRoutePrices({
    from,
    to,
    date,
    time,
    departureMode,
    minChangeMinutes,
    direct,
  }).catch(() => []);
  const bilkomPricesByKey = new Map(bilkomPrices.map((item) => [item.routeKey, item]));
  const bilkomPricesByTimeKey = new Map<string, typeof bilkomPrices>();
  for (const item of bilkomPrices) {
    const timeKey = buildBilkomTimeKey(item.routeKey);
    const current = bilkomPricesByTimeKey.get(timeKey) ?? [];
    current.push(item);
    bilkomPricesByTimeKey.set(timeKey, current);
  }

  const pricedRoutes = await Promise.all(results.map(async (item) => {
      const { buyTicketStandardData: _buyTicketStandardData, buyTicketSharedData: _buyTicketSharedData, ...route } = item;
      const priceMatch = bilkomPricesByKey.get(
        buildBilkomRouteKey({
          departureDate: route.departureDate,
          departureTime: route.departureTime,
          arrivalDate: route.arrivalDate,
          arrivalTime: route.arrivalTime,
          transfers: route.transfers,
          category: route.category,
          trainNumber: route.trainNumber,
        }),
      ) ?? findUniqueBilkomTimeMatch(bilkomPricesByTimeKey, item);
      const bilkomBuyLink = await resolveBilkomBuyLink(session, item) ?? priceMatch?.bilkomBuyLink ?? null;

      return {
        ...route,
        detailsUrl: route.detailsUrl ? absoluteUrl(route.detailsUrl) : "",
        ...(await resolveRoutePricing(session, item, {
          discount,
          bilkomRoutePrice: priceMatch ?? null,
          minChangeMinutes,
          bilkomBuyLink,
        })),
      };
    }));
  const routes = pricedRoutes.filter((route) => route.ticketPrice === null || maxPrice === null || route.ticketPrice <= maxPrice);

  return {
    ref,
    query: {
      from,
      to,
      date,
      time,
      departureMode,
      minChangeMinutes,
      direct,
      maxPrice,
    },
    count: routes.length,
    routes,
  };
}

export async function searchRoute(input: {
  from: string;
  to: string;
  date?: string;
  time?: string;
  arrival?: boolean;
  minChange?: number;
  direct?: boolean;
  discount?: number;
  maxPrice?: number;
  grm?: boolean;
  carriageSvg?: number;
}): Promise<RouteResponse> {
  const response = await searchRoutes(input);
  const route = response.routes[0];
  if (!route) {
    throw new Error("No matching route found.");
  }

  const carriageNumber = normalizeOptionalPositiveInt(input.carriageSvg);
  const needsGrm = Boolean(input.grm) || carriageNumber !== undefined;

  const output: RouteResponse = {
    ref: response.ref,
    query: response.query,
    count: response.count,
    route,
  };

  if (!needsGrm) {
    return output;
  }

  if (route.transfers !== 0 || !route.category || !route.trainNumber) {
    throw new Error("GRM is only available for direct routes with a single train number.");
  }

  const journey = await findBilkomGrmJourney({
    from: response.query.from,
    to: response.query.to,
    date: response.query.date,
    time: response.query.time,
    departureMode: response.query.departureMode,
    minChangeMinutes: response.query.minChangeMinutes,
    direct: response.query.direct,
    routeKey: buildBilkomRouteKey({
      departureDate: route.departureDate,
      departureTime: route.departureTime,
      arrivalDate: route.arrivalDate,
      arrivalTime: route.arrivalTime,
      transfers: route.transfers,
      category: route.category,
      trainNumber: route.trainNumber,
    }),
    routeTimeKey: [
      route.departureDate,
      route.departureTime,
      route.arrivalDate,
      route.arrivalTime,
      String(route.transfers),
    ].join("|"),
  });

  if (!journey) {
    throw new Error("Could not match the selected route to Bilkom GRM data.");
  }

  const [trainComposition, carriagesResponse] = await Promise.all([
    fetchBilkomGrmTrainComposition(journey),
    fetchBilkomGrmCarriages(journey),
  ]);

  output.grm = {
    trainComposition,
    carriages: carriagesResponse.carriages,
    vehicle: carriagesResponse.vehicle,
    stops: carriagesResponse.stops,
  };

  if (carriageNumber !== undefined) {
    if (!carriagesResponse.carriages.some((item) => item.carriageNumber === carriageNumber)) {
      throw new Error(`Carriage ${carriageNumber} is not available for the selected route.`);
    }

    output.carriageSvg = await fetchBilkomGrmCarriageSvg(journey, carriageNumber);
  }

  return output;
}

function findUniqueBilkomTimeMatch(
  bilkomPricesByTimeKey: Map<string, Array<{ routeKey: string; bilkomBuyLink: string | null; ticketPrice: number | null; ticketPriceCurrency: "PLN" | null; ticketPriceSource: "bilkom" | null; ticketPriceAvailable: boolean }>>,
  route: ReturnType<typeof parseRoutes>[number],
) {
  const matches = bilkomPricesByTimeKey.get(
    [
      route.departureDate,
      route.departureTime,
      route.arrivalDate,
      route.arrivalTime,
      String(route.transfers),
    ].join("|"),
  );

  return matches?.length === 1 ? matches[0] : undefined;
}

function buildBilkomTimeKey(routeKey: string) {
  return routeKey.split("|").slice(0, 5).join("|");
}

export function applyDiscountToTicketPrice(price: number | null, discount: number) {
  if (price === null) {
    return null;
  }

  return Math.round(price * (1 - discount / 100) * 100) / 100;
}

function normalizeDiscount(value: number | undefined) {
  if (value === undefined) {
    return 0;
  }

  if (!Number.isFinite(value) || value < 0 || value > 100) {
    throw new Error(`Invalid discount: ${String(value)}`);
  }

  return value;
}

function normalizeMaxPrice(value: number | undefined) {
  if (value === undefined) {
    return null;
  }

  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`Invalid maxPrice: ${String(value)}`);
  }

  return value;
}

async function resolveBilkomBuyLink(
  session: PortalSession,
  route: ReturnType<typeof parseRoutes>[number],
) {
  const buyTicketIds = orderedPortalBuyTicketIds(route.buyTicketStandardData, route.buyTicketSharedData);

  for (const buyTicketId of buyTicketIds) {
    try {
      const url = await session.resolveBuyTicketUrl(buyTicketId);
      if (url && isBilkomUrl(url)) {
        return url;
      }
    } catch {
      continue;
    }
  }

  return null;
}

async function resolveRoutePricing(
  session: PortalSession,
  route: ReturnType<typeof parseRoutes>[number],
  context: {
    discount: number;
    bilkomRoutePrice: { ticketPrice: number | null; ticketPriceCurrency: "PLN" | null; ticketPriceSource: "bilkom" | null; ticketPriceAvailable: boolean } | null;
    minChangeMinutes: number;
    bilkomBuyLink: string | null;
  },
): Promise<{
  bilkomBuyLink: string | null;
  regiojetBuyLink: string | null;
  ticketPrice: number | null;
  ticketPriceCurrency: "PLN" | null;
  ticketPriceSource: TicketPriceSource | null;
  ticketPriceAvailable: boolean;
}> {
  const offers = mergePortalBuyOffers(route.buyTicketStandardData, route.buyTicketSharedData, {
    departureDate: route.departureDate,
    arrivalDate: route.arrivalDate,
  });
  const hasRegioJetOffer = offers.some((offer) => offer.carrierCodes.includes("RJ"));

  if (!hasRegioJetOffer) {
    return {
      bilkomBuyLink: context.bilkomBuyLink,
      regiojetBuyLink: null,
      ticketPrice: applyDiscountToTicketPrice(context.bilkomRoutePrice?.ticketPrice ?? null, context.discount),
      ticketPriceCurrency: context.bilkomRoutePrice?.ticketPriceCurrency ?? null,
      ticketPriceSource: context.bilkomRoutePrice?.ticketPriceSource ?? null,
      ticketPriceAvailable: context.bilkomRoutePrice?.ticketPriceAvailable ?? false,
    };
  }

  let bilkomComponent: number | null = null;
  let regiojetComponent: number | null = null;
  let bilkomBuyLink: string | null = context.bilkomBuyLink;
  let regiojetBuyLink: string | null = null;

  for (const offer of offers) {
    const candidates = await Promise.all(offer.buyTicketIds.map(async (buyTicketId) => {
      const url = await session.resolveBuyTicketUrl(buyTicketId).catch(() => null);
      return {
        buyTicketId,
        url,
      };
    }));

    if (offer.carrierCodes.includes("RJ")) {
      const regiojetCandidate = candidates.find((candidate) => candidate.url && isRegioJetUrl(candidate.url));
      if (!regiojetCandidate?.url) {
        return unavailablePricing(bilkomBuyLink, regiojetBuyLink);
      }

      const regiojetPrice = await fetchRegioJetRoutePrice({
        redirectUrl: regiojetCandidate.url,
        departureDate: offer.departureDate,
        departureTime: offer.departureTime,
        arrivalDate: offer.arrivalDate,
        arrivalTime: offer.arrivalTime,
        discount: context.discount,
      }).catch(() => null);

      if (!regiojetPrice) {
        return unavailablePricing(bilkomBuyLink, regiojetBuyLink);
      }

      regiojetComponent = (regiojetComponent ?? 0) + regiojetPrice.ticketPrice;
      regiojetBuyLink ||= regiojetPrice.regiojetBuyLink;
      continue;
    }

    const bilkomCandidate = candidates.find((candidate) => candidate.url && isBilkomUrl(candidate.url));
    if (!bilkomCandidate?.url) {
      return unavailablePricing(bilkomBuyLink, regiojetBuyLink);
    }

    bilkomBuyLink ||= bilkomCandidate.url;
    const bilkomPrice = await resolveBilkomPanelPrice(offer, context).catch(() => null);
    if (bilkomPrice === null) {
      return unavailablePricing(bilkomBuyLink, regiojetBuyLink);
    }

    bilkomComponent = (bilkomComponent ?? 0) + applyDiscountToTicketPrice(bilkomPrice, context.discount)!;
  }

  if (regiojetComponent !== null && bilkomComponent === null) {
    return {
      bilkomBuyLink,
      regiojetBuyLink,
      ticketPrice: regiojetComponent,
      ticketPriceCurrency: "PLN",
      ticketPriceSource: "regiojet",
      ticketPriceAvailable: true,
    };
  }

  if (regiojetComponent !== null && bilkomComponent !== null) {
    return {
      bilkomBuyLink,
      regiojetBuyLink,
      ticketPrice: Number((regiojetComponent + bilkomComponent).toFixed(2)),
      ticketPriceCurrency: "PLN",
      ticketPriceSource: "bilkom+regiojet",
      ticketPriceAvailable: true,
    };
  }

  return unavailablePricing(bilkomBuyLink, regiojetBuyLink);
}

async function resolveBilkomPanelPrice(
  offer: PortalBuyOffer,
  context: {
    minChangeMinutes: number;
  },
) {
  const prices = await fetchBilkomRoutePrices({
    from: offer.departureStation,
    to: offer.arrivalStation,
    date: offer.departureDate,
    time: offer.departureTime,
    departureMode: true,
    minChangeMinutes: context.minChangeMinutes,
    direct: offer.transfers === 0,
  });

  const exactKey = buildBilkomRouteKey({
    departureDate: offer.departureDate,
    departureTime: offer.departureTime,
    arrivalDate: offer.arrivalDate,
    arrivalTime: offer.arrivalTime,
    transfers: offer.transfers,
    category: offer.transfers === 0 ? offer.primaryCategory : "",
    trainNumber: offer.transfers === 0 ? offer.primaryTrainNumber : "",
  });
  const exactMatch = prices.find((item) => item.routeKey === exactKey);
  if (exactMatch?.ticketPrice !== null && exactMatch?.ticketPrice !== undefined) {
    return exactMatch.ticketPrice;
  }

  const timeMatches = prices.filter((item) => buildBilkomTimeKey(item.routeKey) === [
    offer.departureDate,
    offer.departureTime,
    offer.arrivalDate,
    offer.arrivalTime,
    String(offer.transfers),
  ].join("|"));

  return timeMatches.length === 1 ? timeMatches[0]?.ticketPrice ?? null : null;
}

function orderedPortalBuyTicketIds(standardData: string, sharedData: string) {
  const preferred = usesSingleCarrierBuyFlow(standardData) ? standardData : sharedData;
  const fallback = preferred === standardData ? sharedData : standardData;

  return Array.from(new Set([...extractActiveBuyTicketIds(preferred), ...extractActiveBuyTicketIds(fallback)]));
}

type PortalBuyOffer = {
  key: string;
  departureStation: string;
  departureDate: string;
  departureTime: string;
  arrivalStation: string;
  arrivalDate: string;
  arrivalTime: string;
  carrierCodes: string[];
  transfers: number;
  primaryCategory: string;
  primaryTrainNumber: string;
  buyTicketIds: string[];
};

function mergePortalBuyOffers(
  standardData: string,
  sharedData: string,
  routeDates: { departureDate: string; arrivalDate: string },
) {
  const output = new Map<string, PortalBuyOffer>();

  for (const offer of [
    ...parsePortalBuyOffers(standardData, routeDates),
    ...parsePortalBuyOffers(sharedData, routeDates),
  ]) {
    const current = output.get(offer.key);
    if (!current) {
      output.set(offer.key, offer);
      continue;
    }

    output.set(offer.key, {
      ...current,
      buyTicketIds: Array.from(new Set([...current.buyTicketIds, ...offer.buyTicketIds])),
    });
  }

  return [...output.values()];
}

export function parsePortalBuyOffers(
  value: string,
  routeDates: { departureDate: string; arrivalDate: string },
): PortalBuyOffer[] {
  const offers: PortalBuyOffer[] = [];
  let currentDate = routeDates.departureDate;
  let previousArrivalTime = "";

  for (const panel of value.split("#")) {
    if (!panel) {
      continue;
    }

    const parts = panel.split("|").filter(Boolean);
    if (parts.length < 2) {
      continue;
    }

    const rawId = parts[parts.length - 1] ?? "";
    const buyTicketId = rawId.split("&")[0]?.trim() ?? "";
    const trainParts = parts.slice(0, -1);
    const activeTrainParts = trainParts.filter((trainPart) => {
      const status = trainPart.split(";")[0] ?? "";
      return status === "1" || status === "2";
    });

    if (!buyTicketId || activeTrainParts.length === 0) {
      continue;
    }

    const first = activeTrainParts[0]?.split(";") ?? [];
    const last = activeTrainParts[activeTrainParts.length - 1]?.split(";") ?? [];
    const carrierCodes = Array.from(new Set(activeTrainParts.map((trainPart) => cleanToken(trainPart.split(";")[7] ?? "")).filter(Boolean)));
    const departureStation = cleanToken(first[1] ?? "");
    const departureTime = cleanToken(first[3] ?? "");
    const arrivalStation = cleanToken(last[4] ?? "");
    const arrivalTime = cleanToken(last[6] ?? "");
    currentDate = inferNextDate(previousArrivalTime, departureTime, currentDate);
    const departureDate = currentDate;
    const arrivalDate = inferNextDate(departureTime, arrivalTime, departureDate);
    const primaryCategory = carrierCodes.length === 1 ? carrierCodes[0] ?? "" : "";
    const primaryTrainNumber = "";
    const key = [
      departureStation,
      departureDate,
      departureTime,
      arrivalStation,
      arrivalDate,
      arrivalTime,
      carrierCodes.join(","),
      String(Math.max(activeTrainParts.length - 1, 0)),
    ].join("|");

    offers.push({
      key,
      departureStation,
      departureDate,
      departureTime,
      arrivalStation,
      arrivalDate,
      arrivalTime,
      carrierCodes,
      transfers: Math.max(activeTrainParts.length - 1, 0),
      primaryCategory,
      primaryTrainNumber,
      buyTicketIds: [buyTicketId],
    });

    currentDate = arrivalDate;
    previousArrivalTime = arrivalTime;
  }

  return offers;
}

function usesSingleCarrierBuyFlow(standardData: string) {
  let previousCarrier = "";

  for (const panel of standardData.split("#")) {
    if (!panel) {
      continue;
    }

    const trainParts = panel.split("|").slice(0, -1);
    for (const trainPart of trainParts) {
      if (!trainPart) {
        continue;
      }

      const carrier = trainPart.split(";")[7] ?? "";
      if (previousCarrier && previousCarrier !== carrier) {
        return false;
      }
      previousCarrier = carrier;
    }
  }

  return true;
}

function extractActiveBuyTicketIds(value: string) {
  const output: string[] = [];

  for (const panel of value.split("#")) {
    if (!panel) {
      continue;
    }

    const trainParts = panel.split("|");
    const lastPart = trainParts[trainParts.length - 1] ?? "";
    const id = lastPart.split("&")[0]?.trim() ?? "";
    const active = trainParts
      .slice(0, -1)
      .filter(Boolean)
      .reduce((current, trainPart) => {
        const status = trainPart.split(";")[0] ?? "";
        return status === "1" || status === "2";
      }, false);

    if (active && id) {
      output.push(id);
    }
  }

  return output;
}

function isBilkomUrl(value: string) {
  try {
    return new URL(value).hostname === "bilkom.pl" || new URL(value).hostname.endsWith(".bilkom.pl");
  } catch {
    return false;
  }
}

function unavailablePricing(bilkomBuyLink: string | null, regiojetBuyLink: string | null) {
  return {
    bilkomBuyLink,
    regiojetBuyLink,
    ticketPrice: null,
    ticketPriceCurrency: null,
    ticketPriceSource: null,
    ticketPriceAvailable: false,
  };
}

function inferNextDate(previousTime: string, nextTime: string, baseDate: string) {
  if (!previousTime || !nextTime || compareTimes(nextTime, previousTime) >= 0) {
    return baseDate;
  }

  return addDays(baseDate, 1);
}

function compareTimes(left: string, right: string) {
  return cleanToken(left).localeCompare(cleanToken(right));
}

function addDays(date: string, days: number) {
  const [day, month, year] = date.split(".").map((part) => Number.parseInt(part, 10));
  const value = new Date(Date.UTC(year || 1970, (month || 1) - 1, day || 1));
  value.setUTCDate(value.getUTCDate() + days);

  const nextDay = String(value.getUTCDate()).padStart(2, "0");
  const nextMonth = String(value.getUTCMonth() + 1).padStart(2, "0");
  const nextYear = String(value.getUTCFullYear());
  return `${nextDay}.${nextMonth}.${nextYear}`;
}

function cleanToken(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export async function getStationBoard(input: {
  station: string;
  departures: boolean;
  page?: number;
}): Promise<StationBoardResponse> {
  const station = requireValue(input.station, "station");
  const page = normalizePositiveInt(input.page, 1);
  const session = new PortalSession();
  const payload = await session.getStationBoard(station, input.departures, page);
  const results = parseStationBoard(payload);

  return {
    station,
    board: input.departures ? "departures" : "arrivals",
    page,
    count: results.length,
    entries: results,
  };
}

export async function searchDelays(input: {
  station?: string;
  from?: string;
  to?: string;
  arrival?: boolean;
}): Promise<DelaysResponse> {
  const session = new PortalSession();
  await session.init("/Opoznienia");

  const stationQuery = input.station?.trim() ?? "";
  const fromQuery = input.from?.trim() ?? "";
  const toQuery = input.to?.trim() ?? "";
  const departures = !Boolean(input.arrival);

  let station1: Station;
  let station2: Station | null = null;

  if (stationQuery) {
    station1 = await resolveStation(session, stationQuery);
  } else {
    station1 = await resolveStation(session, requireValue(fromQuery, "from"));
    station2 = await resolveStation(session, requireValue(toQuery, "to"));
  }

  const { ref, html } = await session.searchDelaysByStations({
    station1Id: station1.ID,
    station2Id: station2?.ID ?? -1,
    departures,
  });

  const results = parseDelayResults(html);

  return {
    ref,
    query: stationQuery
      ? { station: stationQuery, departures }
      : {
          from: fromQuery,
          to: toQuery,
          departures,
        },
    count: results.length,
    delays: results.map((item) => ({
      ...item,
      detailsUrl: item.detailsUrl ? absoluteUrl(item.detailsUrl) : "",
    })),
  };
}

export async function searchDisruptions(input: {
  station: string;
  date?: string;
}): Promise<DisruptionsResponse> {
  const stationName = requireValue(input.station, "station");
  const date = normalizeDate(input.date || todayLocalDate());
  const session = new PortalSession();
  await session.init("/Utrudnienia");
  const station = await resolveStation(session, stationName);
  const { ref, html } = await session.searchDisruptions(station.ID, dateToPortalTimestamp(date));
  const results = parseDisruptions(html);

  return {
    ref,
    station: {
      id: station.ID,
      name: station.Nazwa,
    },
    date,
    count: results.length,
    disruptions: results,
  };
}

export function normalizeDate(value: string) {
  const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(value);
  if (!match) {
    throw new Error(`Invalid date format: ${value}. Use DD.MM.YYYY.`);
  }

  return value;
}

export function normalizeTime(value: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) {
    throw new Error(`Invalid time format: ${value}. Use HH:MM.`);
  }

  return value;
}

export function todayLocalDate() {
  const now = new Date();
  return `${pad(now.getDate())}.${pad(now.getMonth() + 1)}.${now.getFullYear()}`;
}

export function nowLocalTimeRounded() {
  const now = new Date();
  now.setSeconds(0, 0);
  return `${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

export function dateToPortalTimestamp(date: string) {
  const parts = date.split(".").map(Number);
  const [day, month, year] = parts;
  if (!day || !month || !year) {
    throw new Error(`Invalid date: ${date}`);
  }
  const dt = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
  return dt.getTime();
}

export function absoluteUrl(path: string) {
  return path.startsWith("http") ? path : `https://portalpasazera.pl${path}`;
}

export function requireValue(value: string, label: string) {
  if (!value) {
    throw new Error(`Missing required value: ${label}`);
  }

  return value;
}

async function resolveStation(session: PortalSession, query: string) {
  const results = await session.searchStations(query);
  const exact = results.find((item) => item.Nazwa.toLowerCase() === query.toLowerCase());
  const station = exact ?? results[0];

  if (!station) {
    throw new Error(`No station matched "${query}".`);
  }

  return station;
}

function normalizePositiveInt(value: number | string | undefined, fallback: number) {
  if (typeof value === "number" && Number.isFinite(value) && value >= 1) {
    return Math.floor(value);
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed) && parsed >= 1) {
      return parsed;
    }
  }

  return fallback;
}

function normalizeOptionalPositiveInt(value: number | string | undefined) {
  if (typeof value === "number" && Number.isFinite(value) && value >= 1) {
    return Math.floor(value);
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed) && parsed >= 1) {
      return parsed;
    }
    throw new Error(`Invalid carriage number: ${value}.`);
  }

  return undefined;
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}
