export type * from "./types";
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

export declare class PkpSdk {
  searchStations(query: string): Promise<StationsResponse>;
  searchTrainNumbers(query: string): Promise<TrainNumbersResponse>;
  searchRoutes(input: SearchRoutesInput): Promise<RoutesResponse>;
  searchRoute(input: SearchRouteInput): Promise<RouteResponse>;
  getStationBoard(input: StationBoardInput): Promise<StationBoardResponse>;
  searchDelays(input: SearchDelaysInput): Promise<DelaysResponse>;
  searchDisruptions(input: SearchDisruptionsInput): Promise<DisruptionsResponse>;
}

export declare function createPkpSdk(): PkpSdk;
export declare function searchStations(query: string): Promise<StationsResponse>;
export declare function searchTrainNumbers(query: string): Promise<TrainNumbersResponse>;
export declare function searchRoutes(input: SearchRoutesInput): Promise<RoutesResponse>;
export declare function searchRoute(input: SearchRouteInput): Promise<RouteResponse>;
export declare function getStationBoard(input: StationBoardInput): Promise<StationBoardResponse>;
export declare function searchDelays(input: SearchDelaysInput): Promise<DelaysResponse>;
export declare function searchDisruptions(input: SearchDisruptionsInput): Promise<DisruptionsResponse>;
