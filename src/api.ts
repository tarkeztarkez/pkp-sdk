import { PortalSession, type Station } from "./client";
import { buildBilkomRouteKey, fetchBilkomRoutePrices } from "./bilkom";
import {
  parseDelayResults,
  parseDisruptions,
  parseRoutes,
  parseStationBoard,
} from "./parsers";

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
  };
  count: number;
  routes: Array<
    ReturnType<typeof parseRoutes>[number] & {
      detailsUrl: string;
      ticketPrice: number | null;
      ticketPriceCurrency: "PLN" | null;
      ticketPriceSource: "bilkom" | null;
      ticketPriceAvailable: boolean;
    }
  >;
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
}): Promise<RoutesResponse> {
  const from = requireValue(input.from, "from");
  const to = requireValue(input.to, "to");
  const date = normalizeDate(input.date || todayLocalDate());
  const time = normalizeTime(input.time || nowLocalTimeRounded());
  const minChangeMinutes = normalizePositiveInt(input.minChange, 3);
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
    },
    count: results.length,
    routes: results.map((item) => {
      const priceMatch = bilkomPricesByKey.get(
        buildBilkomRouteKey({
          departureDate: item.departureDate,
          departureTime: item.departureTime,
          arrivalDate: item.arrivalDate,
          arrivalTime: item.arrivalTime,
          transfers: item.transfers,
          category: item.category,
          trainNumber: item.trainNumber,
        }),
      ) ?? findUniqueBilkomTimeMatch(bilkomPricesByTimeKey, item);

      return {
        ...item,
        detailsUrl: item.detailsUrl ? absoluteUrl(item.detailsUrl) : "",
        ticketPrice: priceMatch?.ticketPrice ?? null,
        ticketPriceCurrency: priceMatch?.ticketPriceCurrency ?? null,
        ticketPriceSource: priceMatch?.ticketPriceSource ?? null,
        ticketPriceAvailable: priceMatch?.ticketPriceAvailable ?? false,
      };
    }),
  };
}

function findUniqueBilkomTimeMatch(
  bilkomPricesByTimeKey: Map<string, Array<{ routeKey: string; ticketPrice: number | null; ticketPriceCurrency: "PLN" | null; ticketPriceSource: "bilkom" | null; ticketPriceAvailable: boolean }>>,
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

function pad(value: number) {
  return String(value).padStart(2, "0");
}
