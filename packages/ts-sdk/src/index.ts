import {
  getStationBoard as getStationBoardCore,
  searchDelays as searchDelaysCore,
  searchDisruptions as searchDisruptionsCore,
  searchRoute as searchRouteCore,
  searchRoutes as searchRoutesCore,
  searchStations as searchStationsCore,
  searchTrainNumbers as searchTrainNumbersCore,
} from "../../core/src/services";
import type {
  DelaysResponse,
  DisruptionsResponse,
  RouteResponse,
  RoutesResponse,
  SearchDelaysInput,
  SearchDisruptionsInput,
  SearchRouteInput,
  SearchRoutesInput,
  StationBoardInput,
  StationBoardResponse,
  StationsResponse,
  TrainNumbersResponse,
} from "./types";

export type * from "./types";

export class PkpSdk {
  searchStations(query: string): Promise<StationsResponse> {
    return searchStationsCore(query) as Promise<StationsResponse>;
  }

  searchTrainNumbers(query: string): Promise<TrainNumbersResponse> {
    return searchTrainNumbersCore(query) as Promise<TrainNumbersResponse>;
  }

  searchRoutes(input: SearchRoutesInput): Promise<RoutesResponse> {
    return searchRoutesCore(input) as Promise<RoutesResponse>;
  }

  searchRoute(input: SearchRouteInput): Promise<RouteResponse> {
    return searchRouteCore(input) as Promise<RouteResponse>;
  }

  getStationBoard(input: StationBoardInput): Promise<StationBoardResponse> {
    return getStationBoardCore(input) as Promise<StationBoardResponse>;
  }

  searchDelays(input: SearchDelaysInput): Promise<DelaysResponse> {
    return searchDelaysCore(input) as Promise<DelaysResponse>;
  }

  searchDisruptions(input: SearchDisruptionsInput): Promise<DisruptionsResponse> {
    return searchDisruptionsCore(input) as Promise<DisruptionsResponse>;
  }
}

export function createPkpSdk() {
  return new PkpSdk();
}

export function searchStations(query: string): Promise<StationsResponse> {
  return searchStationsCore(query) as Promise<StationsResponse>;
}

export function searchTrainNumbers(query: string): Promise<TrainNumbersResponse> {
  return searchTrainNumbersCore(query) as Promise<TrainNumbersResponse>;
}

export function searchRoutes(input: SearchRoutesInput): Promise<RoutesResponse> {
  return searchRoutesCore(input) as Promise<RoutesResponse>;
}

export function searchRoute(input: SearchRouteInput): Promise<RouteResponse> {
  return searchRouteCore(input) as Promise<RouteResponse>;
}

export function getStationBoard(input: StationBoardInput): Promise<StationBoardResponse> {
  return getStationBoardCore(input) as Promise<StationBoardResponse>;
}

export function searchDelays(input: SearchDelaysInput): Promise<DelaysResponse> {
  return searchDelaysCore(input) as Promise<DelaysResponse>;
}

export function searchDisruptions(input: SearchDisruptionsInput): Promise<DisruptionsResponse> {
  return searchDisruptionsCore(input) as Promise<DisruptionsResponse>;
}
