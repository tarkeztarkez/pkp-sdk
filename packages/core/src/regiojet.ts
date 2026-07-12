export type RegioJetTariff = "REGULAR" | "PL_STUDENT";

export type RegioJetRoutePrice = {
  routeId: string;
  fromStationId: string;
  toStationId: string;
  ticketPrice: number;
  ticketPriceCurrency: "PLN";
  regiojetBuyLink: string;
};

type RegioJetSearchRoute = {
  id?: string;
  departureStationId?: number;
  departureTime?: string;
  arrivalStationId?: number;
  arrivalTime?: string;
  priceFrom?: number;
};

type RegioJetSearchResponse = {
  routes?: RegioJetSearchRoute[];
};

export async function fetchRegioJetRoutePrice(input: {
  redirectUrl: string;
  departureDate: string;
  departureTime: string;
  arrivalDate: string;
  arrivalTime: string;
  discount: number;
}): Promise<RegioJetRoutePrice | null> {
  const redirect = parseRegioJetRedirect(input.redirectUrl, input.discount);
  const url = new URL("/restapi/routes/search/simple", "https://brn-ybus-pubapi.sa.cz");
  url.searchParams.set("tariffs", redirect.tariff);
  url.searchParams.set("fromLocationId", redirect.fromLocationId);
  url.searchParams.set("fromLocationType", redirect.fromLocationType);
  url.searchParams.set("toLocationId", redirect.toLocationId);
  url.searchParams.set("toLocationType", redirect.toLocationType);
  url.searchParams.set("departureDate", redirect.departureDate);
  url.searchParams.set("fromLocationName", "");
  url.searchParams.set("toLocationName", "");

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`RegioJet route lookup failed with status ${response.status}.`);
  }

  const payload = await response.json() as RegioJetSearchResponse;
  const exactMatches = (payload.routes ?? []).filter((route) =>
    normalizeIsoDateTime(route.departureTime) === normalizePortalDateTime(input.departureDate, input.departureTime) &&
    normalizeIsoDateTime(route.arrivalTime) === normalizePortalDateTime(input.arrivalDate, input.arrivalTime)
  );

  if (exactMatches.length !== 1) {
    return null;
  }

  const match = exactMatches[0];
  if (!match) {
    return null;
  }
  const routeId = cleanToken(match.id ?? "");
  const fromStationId = match.departureStationId ? String(match.departureStationId) : "";
  const toStationId = match.arrivalStationId ? String(match.arrivalStationId) : "";
  const ticketPrice = typeof match.priceFrom === "number" && match.priceFrom > 0
    ? Number(match.priceFrom.toFixed(2))
    : null;

  if (!routeId || !fromStationId || !toStationId || ticketPrice === null) {
    return null;
  }

  const buyLink = new URL("/reservation/fare/there", redirect.origin);
  buyLink.searchParams.set("routeId", routeId);
  buyLink.searchParams.set("fromStationId", fromStationId);
  buyLink.searchParams.set("toStationId", toStationId);
  buyLink.searchParams.set("tariffs", redirect.tariff);

  return {
    routeId,
    fromStationId,
    toStationId,
    ticketPrice,
    ticketPriceCurrency: "PLN",
    regiojetBuyLink: buyLink.toString(),
  };
}

export function parseRegioJetRedirect(redirectUrl: string, discount: number) {
  const url = new URL(redirectUrl);
  const fromLocationId = cleanToken(url.searchParams.get("fromLocationId") ?? "");
  const fromLocationType = cleanToken(url.searchParams.get("fromLocationType") ?? "");
  const toLocationId = cleanToken(url.searchParams.get("toLocationId") ?? "");
  const toLocationType = cleanToken(url.searchParams.get("toLocationType") ?? "");
  const departureDate = cleanToken(url.searchParams.get("departureDate") ?? "");

  if (!isRegioJetUrl(redirectUrl) || !fromLocationId || !fromLocationType || !toLocationId || !toLocationType || !departureDate) {
    throw new Error(`Invalid RegioJet redirect URL: ${redirectUrl}`);
  }

  return {
    origin: `${url.protocol}//${url.host}`,
    fromLocationId,
    fromLocationType,
    toLocationId,
    toLocationType,
    departureDate,
    tariff: regioJetTariffForDiscount(discount),
  };
}

export function isRegioJetUrl(value: string) {
  try {
    const hostname = new URL(value).hostname;
    return hostname === "regiojet.com" || hostname.endsWith(".regiojet.com") ||
      hostname === "regiojet.pl" || hostname.endsWith(".regiojet.pl");
  } catch {
    return false;
  }
}

export function regioJetTariffForDiscount(discount: number): RegioJetTariff {
  return discount === 51 ? "PL_STUDENT" : "REGULAR";
}

function normalizePortalDateTime(date: string, time: string) {
  const [day = "", month = "", year = ""] = cleanToken(date).split(".");
  const normalizedTime = cleanToken(time);
  return `${year}-${month}-${day}T${normalizedTime}:00`;
}

function normalizeIsoDateTime(value: string | undefined) {
  const match = cleanToken(value ?? "").match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
  return match ? `${match[1]}T${match[2]}:00` : "";
}

function cleanToken(value: string) {
  return value.replace(/\s+/g, " ").trim();
}
