import {
  getStationBoard,
  searchDelays,
  searchDisruptions,
  searchRoute,
  searchRoutes,
  searchStations,
  searchTrainNumbers,
  type DelaysResponse,
  type DisruptionsResponse,
  type RouteResponse,
  type RoutesResponse,
  type StationBoardResponse,
  type StationsResponse,
  type TrainNumbersResponse,
} from "../../core/src";

export type {
  DelaysResponse,
  DisruptionsResponse,
  RouteResponse,
  RoutesResponse,
  StationBoardResponse,
  StationsResponse,
  TrainNumbersResponse,
} from "../../core/src";

export type SearchRoutesInput = Parameters<typeof searchRoutes>[0];
export type SearchRouteInput = Parameters<typeof searchRoute>[0];
export type StationBoardInput = Parameters<typeof getStationBoard>[0];
export type SearchDelaysInput = Parameters<typeof searchDelays>[0];
export type SearchDisruptionsInput = Parameters<typeof searchDisruptions>[0];

export class PkpSdk {
  searchStations(query: string): Promise<StationsResponse> {
    return searchStations(query);
  }

  searchTrainNumbers(query: string): Promise<TrainNumbersResponse> {
    return searchTrainNumbers(query);
  }

  searchRoutes(input: SearchRoutesInput): Promise<RoutesResponse> {
    return searchRoutes(input);
  }

  searchRoute(input: SearchRouteInput): Promise<RouteResponse> {
    return searchRoute(input);
  }

  getStationBoard(input: StationBoardInput): Promise<StationBoardResponse> {
    return getStationBoard(input);
  }

  searchDelays(input: SearchDelaysInput): Promise<DelaysResponse> {
    return searchDelays(input);
  }

  searchDisruptions(input: SearchDisruptionsInput): Promise<DisruptionsResponse> {
    return searchDisruptions(input);
  }
}

export function createPkpSdk() {
  return new PkpSdk();
}

export {
  getStationBoard,
  searchDelays,
  searchDisruptions,
  searchRoute,
  searchRoutes,
  searchStations,
  searchTrainNumbers,
};
