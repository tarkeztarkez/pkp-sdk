export type RouteResult = {
  departureStation: string;
  departurePlatform: string;
  departureDate: string;
  departureTime: string;
  arrivalStation: string;
  arrivalPlatform: string;
  arrivalDate: string;
  arrivalTime: string;
  carrier: string;
  trainNumber: string;
  category: string;
  relation: string;
  duration: string;
  transfers: number;
  detailsUrl: string;
};

export type DelayResult = {
  summary: string;
  detailsUrl: string;
  difficulties: string[];
};

export type DisruptionResult = {
  title: string;
  body: string[];
};

export type StationBoardEntry = {
  time: string;
  delayMinutes: number;
  platform: string;
  track: string;
  carrier: string;
  trainName: string;
  trainNumber: string;
  relationFrom: string;
  relationTo: string;
  difficulties: string[];
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

export type RoutesQuery = {
  from: string;
  to: string;
  date: string;
  time: string;
  departureMode: boolean;
  minChangeMinutes: number;
  direct: boolean;
};

export type RouteWithPrice = RouteResult & {
  detailsUrl: string;
  ticketPrice: number | null;
  ticketPriceCurrency: "PLN" | null;
  ticketPriceSource: "bilkom" | null;
  ticketPriceAvailable: boolean;
};

export type RoutesResponse = {
  ref: string;
  query: RoutesQuery;
  count: number;
  routes: RouteWithPrice[];
};

export type RouteResponse = {
  ref: string;
  query: RoutesQuery;
  count: number;
  route: RouteWithPrice;
  grm?: {
    trainComposition: BilkomGrmTrainComposition;
    carriages: BilkomGrmCarriage[];
    vehicle: Record<string, unknown> | null;
    stops: Array<Record<string, unknown>>;
  };
  carriageSvg?: string;
};

export type StationBoardResponse = {
  station: string;
  board: "departures" | "arrivals";
  page: number;
  count: number;
  entries: StationBoardEntry[];
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
  delays: DelayResult[];
};

export type DisruptionsResponse = {
  ref: string;
  station: {
    id: number;
    name: string;
  };
  date: string;
  count: number;
  disruptions: DisruptionResult[];
};

export type SearchRoutesInput = {
  from: string;
  to: string;
  date?: string;
  time?: string;
  arrival?: boolean;
  minChange?: number;
  direct?: boolean;
};

export type SearchRouteInput = SearchRoutesInput & {
  grm?: boolean;
  carriageSvg?: number;
};

export type StationBoardInput = {
  station: string;
  departures: boolean;
  page?: number;
};

export type SearchDelaysInput = {
  station?: string;
  from?: string;
  to?: string;
  arrival?: boolean;
};

export type SearchDisruptionsInput = {
  station: string;
  date?: string;
};
