import {
  getStationBoard,
  searchDelays,
  searchDisruptions,
  searchRoutes,
  searchStations,
  searchTrainConsists,
  searchTrainNumbers,
} from "./api";

type ServerOptions = {
  host?: string;
  port?: number;
};

export function startServer(options: ServerOptions = {}) {
  const host = options.host || "127.0.0.1";
  const port = normalizePort(options.port);
  const openApi = buildOpenApiDocument(host, port);

  return Bun.serve({
    hostname: host,
    port,
    async fetch(request) {
      if (request.method === "OPTIONS") {
        return withCors(new Response(null, { status: 204 }));
      }

      const url = new URL(request.url);

      try {
        if (request.method === "GET" && url.pathname === "/") {
          return jsonResponse({
            name: "pkp-cli server",
            endpoints: [
              "/stations",
              "/train-numbers",
              "/routes",
              "/departures",
              "/arrivals",
              "/delays",
              "/disruptions",
              "/train-consists",
              "/openapi.json",
            ],
          });
        }

        if (request.method === "GET" && url.pathname === "/openapi.json") {
          return jsonResponse(openApi);
        }

        if (request.method === "GET" && url.pathname === "/stations") {
          return jsonResponse(await searchStations(requiredParam(url, "query")));
        }

        if (request.method === "GET" && url.pathname === "/train-numbers") {
          return jsonResponse(await searchTrainNumbers(requiredParam(url, "query")));
        }

        if (request.method === "GET" && url.pathname === "/routes") {
          return jsonResponse(
            await searchRoutes({
              from: requiredParam(url, "from"),
              to: requiredParam(url, "to"),
              date: optionalParam(url, "date"),
              time: optionalParam(url, "time"),
              arrival: booleanParam(url, "arrival"),
              minChange: numberParam(url, "minChange"),
              direct: booleanParam(url, "direct"),
            }),
          );
        }

        if (request.method === "GET" && url.pathname === "/departures") {
          return jsonResponse(
            await getStationBoard({
              station: requiredParam(url, "station"),
              departures: true,
              page: numberParam(url, "page"),
            }),
          );
        }

        if (request.method === "GET" && url.pathname === "/arrivals") {
          return jsonResponse(
            await getStationBoard({
              station: requiredParam(url, "station"),
              departures: false,
              page: numberParam(url, "page"),
            }),
          );
        }

        if (request.method === "GET" && url.pathname === "/delays") {
          return jsonResponse(
            await searchDelays({
              station: optionalParam(url, "station"),
              from: optionalParam(url, "from"),
              to: optionalParam(url, "to"),
              arrival: booleanParam(url, "arrival"),
            }),
          );
        }

        if (request.method === "GET" && url.pathname === "/disruptions") {
          return jsonResponse(
            await searchDisruptions({
              station: requiredParam(url, "station"),
              date: optionalParam(url, "date"),
            }),
          );
        }

        if (request.method === "GET" && url.pathname === "/train-consists") {
          return jsonResponse(
            await searchTrainConsists({
              station: requiredParam(url, "station"),
              train: requiredParam(url, "train"),
            }),
          );
        }

        return jsonResponse({ error: `Not found: ${url.pathname}` }, 404);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const status = message.startsWith("Missing required") || message.startsWith("Invalid ") ? 400 : 500;
        return jsonResponse({ error: message }, status);
      }
    },
  });
}

function buildOpenApiDocument(host: string, port: number) {
  const serverUrl = `http://${host}:${port}`;

  return {
    openapi: "3.1.0",
    info: {
      title: "pkp-cli REST API",
      version: "1.0.0",
      description: "REST wrapper around pkp-cli queries for portalpasazera.pl.",
    },
    servers: [{ url: serverUrl }],
    components: {
      schemas: {
        Error: {
          type: "object",
          properties: {
            error: { type: "string" },
          },
          required: ["error"],
          additionalProperties: false,
        },
        Station: {
          type: "object",
          properties: {
            id: { type: "integer" },
            name: { type: "string" },
            key: { type: "string" },
            iso: { type: "string" },
            onRequestStop: { type: "boolean" },
          },
          required: ["id", "name", "key", "iso", "onRequestStop"],
          additionalProperties: false,
        },
        StationsResponse: {
          type: "object",
          properties: {
            query: { type: "string" },
            count: { type: "integer" },
            stations: {
              type: "array",
              items: schemaRef("Station"),
            },
          },
          required: ["query", "count", "stations"],
          additionalProperties: false,
        },
        TrainNumber: {
          type: "object",
          properties: {
            number: { type: "string" },
            key: { type: "string" },
          },
          required: ["number", "key"],
          additionalProperties: false,
        },
        TrainNumbersResponse: {
          type: "object",
          properties: {
            query: { type: "string" },
            count: { type: "integer" },
            trainNumbers: {
              type: "array",
              items: schemaRef("TrainNumber"),
            },
          },
          required: ["query", "count", "trainNumbers"],
          additionalProperties: false,
        },
        Route: {
          type: "object",
          properties: {
            departureStation: { type: "string" },
            departurePlatform: { type: "string" },
            departureDate: { type: "string" },
            departureTime: { type: "string" },
            arrivalStation: { type: "string" },
            arrivalPlatform: { type: "string" },
            arrivalDate: { type: "string" },
            arrivalTime: { type: "string" },
            carrier: { type: "string" },
            trainNumber: { type: "string" },
            category: { type: "string" },
            relation: { type: "string" },
            duration: { type: "string" },
            transfers: { type: "integer" },
            detailsUrl: { type: "string" },
          },
          required: [
            "departureStation",
            "departurePlatform",
            "departureDate",
            "departureTime",
            "arrivalStation",
            "arrivalPlatform",
            "arrivalDate",
            "arrivalTime",
            "carrier",
            "trainNumber",
            "category",
            "relation",
            "duration",
            "transfers",
            "detailsUrl",
          ],
          additionalProperties: false,
        },
        RoutesQuery: {
          type: "object",
          properties: {
            from: { type: "string" },
            to: { type: "string" },
            date: { type: "string" },
            time: { type: "string" },
            departureMode: { type: "boolean" },
            minChangeMinutes: { type: "integer" },
            direct: { type: "boolean" },
          },
          required: ["from", "to", "date", "time", "departureMode", "minChangeMinutes", "direct"],
          additionalProperties: false,
        },
        RoutesResponse: {
          type: "object",
          properties: {
            ref: { type: "string" },
            query: schemaRef("RoutesQuery"),
            count: { type: "integer" },
            routes: {
              type: "array",
              items: schemaRef("Route"),
            },
          },
          required: ["ref", "query", "count", "routes"],
          additionalProperties: false,
        },
        StationBoardEntry: {
          type: "object",
          properties: {
            time: { type: "string" },
            delayMinutes: { type: "integer" },
            platform: { type: "string" },
            track: { type: "string" },
            carrier: { type: "string" },
            trainName: { type: "string" },
            trainNumber: { type: "string" },
            relationFrom: { type: "string" },
            relationTo: { type: "string" },
            difficulties: {
              type: "array",
              items: { type: "string" },
            },
          },
          required: [
            "time",
            "delayMinutes",
            "platform",
            "track",
            "carrier",
            "trainName",
            "trainNumber",
            "relationFrom",
            "relationTo",
            "difficulties",
          ],
          additionalProperties: false,
        },
        StationBoardResponse: {
          type: "object",
          properties: {
            station: { type: "string" },
            board: { type: "string", enum: ["departures", "arrivals"] },
            page: { type: "integer" },
            count: { type: "integer" },
            entries: {
              type: "array",
              items: schemaRef("StationBoardEntry"),
            },
          },
          required: ["station", "board", "page", "count", "entries"],
          additionalProperties: false,
        },
        Delay: {
          type: "object",
          properties: {
            summary: { type: "string" },
            detailsUrl: { type: "string" },
            difficulties: {
              type: "array",
              items: { type: "string" },
            },
          },
          required: ["summary", "detailsUrl", "difficulties"],
          additionalProperties: false,
        },
        DelaysQueryByStation: {
          type: "object",
          properties: {
            station: { type: "string" },
            departures: { type: "boolean" },
          },
          required: ["station", "departures"],
          additionalProperties: false,
        },
        DelaysQueryByRoute: {
          type: "object",
          properties: {
            from: { type: "string" },
            to: { type: "string" },
            departures: { type: "boolean" },
          },
          required: ["from", "to", "departures"],
          additionalProperties: false,
        },
        DelaysResponse: {
          type: "object",
          properties: {
            ref: { type: "string" },
            query: {
              oneOf: [schemaRef("DelaysQueryByStation"), schemaRef("DelaysQueryByRoute")],
            },
            count: { type: "integer" },
            delays: {
              type: "array",
              items: schemaRef("Delay"),
            },
          },
          required: ["ref", "query", "count", "delays"],
          additionalProperties: false,
        },
        Disruption: {
          type: "object",
          properties: {
            title: { type: "string" },
            body: {
              type: "array",
              items: { type: "string" },
            },
          },
          required: ["title", "body"],
          additionalProperties: false,
        },
        DisruptionsStation: {
          type: "object",
          properties: {
            id: { type: "integer" },
            name: { type: "string" },
          },
          required: ["id", "name"],
          additionalProperties: false,
        },
        DisruptionsResponse: {
          type: "object",
          properties: {
            ref: { type: "string" },
            station: schemaRef("DisruptionsStation"),
            date: { type: "string" },
            count: { type: "integer" },
            disruptions: {
              type: "array",
              items: schemaRef("Disruption"),
            },
          },
          required: ["ref", "station", "date", "count", "disruptions"],
          additionalProperties: false,
        },
        TrainConsistSequenceItem: {
          type: "object",
          properties: {
            raw: { type: "string" },
            kind: { type: "string", enum: ["carriage", "marker"] },
            carriageNumber: { type: "string" },
            noteNumber: { type: "string" },
          },
          required: ["raw", "kind", "carriageNumber", "noteNumber"],
          additionalProperties: false,
        },
        TrainConsistEntry: {
          type: "object",
          properties: {
            page: { type: "integer" },
            departureTime: { type: "string" },
            platform: { type: "string" },
            track: { type: "string" },
            trainNumber: { type: "string" },
            trainName: { type: "string" },
            destinations: {
              type: "array",
              items: { type: "string" },
            },
            relation: { type: "string" },
            consistRaw: { type: "string" },
            sequence: {
              type: "array",
              items: schemaRef("TrainConsistSequenceItem"),
            },
            notes: {
              type: "array",
              items: { type: "string" },
            },
          },
          required: [
            "page",
            "departureTime",
            "platform",
            "track",
            "trainNumber",
            "trainName",
            "destinations",
            "relation",
            "consistRaw",
            "sequence",
            "notes",
          ],
          additionalProperties: false,
        },
        TrainConsistsQuery: {
          type: "object",
          properties: {
            station: { type: "string" },
            train: { type: "string" },
          },
          required: ["station", "train"],
          additionalProperties: false,
        },
        TrainConsistsStation: {
          type: "object",
          properties: {
            name: { type: "string" },
            pdfUrl: { type: "string" },
          },
          required: ["name", "pdfUrl"],
          additionalProperties: false,
        },
        TrainConsistsResponse: {
          type: "object",
          properties: {
            query: schemaRef("TrainConsistsQuery"),
            station: schemaRef("TrainConsistsStation"),
            validFrom: { type: "string" },
            validTo: { type: "string" },
            count: { type: "integer" },
            matches: {
              type: "array",
              items: schemaRef("TrainConsistEntry"),
            },
          },
          required: ["query", "station", "validFrom", "validTo", "count", "matches"],
          additionalProperties: false,
        },
        ServerIndexResponse: {
          type: "object",
          properties: {
            name: { type: "string" },
            endpoints: {
              type: "array",
              items: { type: "string" },
            },
          },
          required: ["name", "endpoints"],
          additionalProperties: false,
        },
      },
    },
    paths: {
      "/stations": {
        get: {
          operationId: "searchStations",
          summary: "Search stations",
          parameters: [queryParam("query", "Station search text", true)],
          responses: successResponse("Station search results", "StationsResponse"),
        },
      },
      "/train-numbers": {
        get: {
          operationId: "searchTrainNumbers",
          summary: "Search train numbers",
          parameters: [queryParam("query", "Train number search text", true)],
          responses: successResponse("Train number search results", "TrainNumbersResponse"),
        },
      },
      "/routes": {
        get: {
          operationId: "searchRoutes",
          summary: "Search routes between stations",
          parameters: [
            queryParam("from", "Origin station name", true),
            queryParam("to", "Destination station name", true),
            queryParam("date", "Date in DD.MM.YYYY"),
            queryParam("time", "Time in HH:MM"),
            queryParam("arrival", "If true, search by arrival time instead of departure time", false, "boolean"),
            queryParam("minChange", "Minimum transfer time in minutes", false, "integer"),
            queryParam("direct", "If true, return direct connections only", false, "boolean"),
          ],
          responses: successResponse("Route search results", "RoutesResponse"),
        },
      },
      "/departures": {
        get: {
          operationId: "getDepartures",
          summary: "Get station departures board",
          parameters: [
            queryParam("station", "Station name", true),
            queryParam("page", "Pagination page", false, "integer"),
          ],
          responses: successResponse("Departure board results", "StationBoardResponse"),
        },
      },
      "/arrivals": {
        get: {
          operationId: "getArrivals",
          summary: "Get station arrivals board",
          parameters: [
            queryParam("station", "Station name", true),
            queryParam("page", "Pagination page", false, "integer"),
          ],
          responses: successResponse("Arrival board results", "StationBoardResponse"),
        },
      },
      "/delays": {
        get: {
          operationId: "searchDelays",
          summary: "Search delays by station or station pair",
          parameters: [
            queryParam("station", "Single station name"),
            queryParam("from", "Origin station name"),
            queryParam("to", "Destination station name"),
            queryParam("arrival", "If true, show arrivals instead of departures", false, "boolean"),
          ],
          responses: successResponse("Delay search results", "DelaysResponse"),
        },
      },
      "/disruptions": {
        get: {
          operationId: "searchDisruptions",
          summary: "Search disruptions for a station and date",
          parameters: [
            queryParam("station", "Station name", true),
            queryParam("date", "Date in DD.MM.YYYY"),
          ],
          responses: successResponse("Disruption results", "DisruptionsResponse"),
        },
      },
      "/train-consists": {
        get: {
          operationId: "searchTrainConsists",
          summary: "Get parsed Intercity train consist data for a station PDF and train",
          parameters: [
            queryParam("station", "Station name from the Intercity train consist list", true),
            queryParam("train", "Train number or train label fragment", true),
          ],
          responses: successResponse("Train consist results", "TrainConsistsResponse"),
        },
      },
      "/openapi.json": {
        get: {
          operationId: "getOpenApiDocument",
          summary: "Get the OpenAPI document",
          responses: successResponse("OpenAPI specification"),
        },
      },
      "/": {
        get: {
          operationId: "getServerIndex",
          summary: "Get server metadata",
          responses: successResponse("Server metadata", "ServerIndexResponse"),
        },
      },
    },
  };
}

function queryParam(name: string, description: string, required = false, type: "string" | "integer" | "boolean" = "string") {
  return {
    name,
    in: "query",
    required,
    description,
    schema: { type },
  };
}

function successResponse(description: string, schemaName?: string) {
  return {
    200: {
      description,
      content: {
        "application/json": {
          schema: schemaName
            ? schemaRef(schemaName)
            : {
                type: "object",
                additionalProperties: true,
              },
        },
      },
    },
    400: errorResponse("Invalid input"),
    500: errorResponse("Unexpected upstream or server error"),
  };
}

function errorResponse(description: string) {
  return {
    description,
    content: {
      "application/json": {
        schema: schemaRef("Error"),
      },
    },
  };
}

function schemaRef(name: string) {
  return {
    $ref: `#/components/schemas/${name}`,
  };
}

function jsonResponse(payload: unknown, status = 200) {
  return withCors(
    new Response(JSON.stringify(payload, null, 2), {
      status,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
      },
    }),
  );
}

function withCors(response: Response) {
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function requiredParam(url: URL, key: string) {
  const value = url.searchParams.get(key)?.trim() ?? "";
  if (!value) {
    throw new Error(`Missing required value: ${key}`);
  }
  return value;
}

function optionalParam(url: URL, key: string) {
  return url.searchParams.get(key)?.trim() ?? "";
}

function booleanParam(url: URL, key: string) {
  const value = optionalParam(url, key).toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

function numberParam(url: URL, key: string) {
  const value = optionalParam(url, key);
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid integer format: ${key}`);
  }
  return parsed;
}

function normalizePort(value: number | undefined) {
  if (typeof value === "number" && Number.isFinite(value) && value >= 1 && value <= 65535) {
    return Math.floor(value);
  }

  return 3000;
}
