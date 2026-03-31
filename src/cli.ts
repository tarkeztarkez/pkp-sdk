import {
  getStationBoard,
  normalizeDate,
  normalizeTime,
  nowLocalTimeRounded,
  requireValue,
  searchDelays,
  searchDisruptions,
  searchRoutes,
  searchStations,
  searchTrainNumbers,
  todayLocalDate,
} from "./api";
import { cleanText } from "./parsers";
import { startServer } from "./server";

type FlagValue = string | boolean;

export async function runCli(argv: string[]) {
  const [command, ...rest] = argv;

  if (!command || command === "help" || command === "--help" || command === "-h") {
    printHelp();
    return;
  }

  const { positionals, flags } = parseArgs(rest);

  try {
    switch (command) {
      case "stations":
        await handleStations(positionals, flags);
        break;
      case "train-numbers":
        await handleTrainNumbers(positionals, flags);
        break;
      case "routes":
        await handleRoutes(flags);
        break;
      case "departures":
        await handleBoard(positionals, flags, true);
        break;
      case "arrivals":
        await handleBoard(positionals, flags, false);
        break;
      case "delays":
        await handleDelays(flags);
        break;
      case "disruptions":
        await handleDisruptions(flags);
        break;
      case "server":
        await handleServer(rest);
        break;
      default:
        throw new Error(`Unknown command: ${command}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Error: ${message}`);
    process.exitCode = 1;
  }
}

async function handleStations(positionals: string[], flags: Map<string, FlagValue>) {
  const query = requireValue(firstPositionalOrFlag(positionals, flags, "query"), "station query");
  const response = await searchStations(query);

  if (flagBool(flags, "json")) {
    printJson(response);
    return;
  }

  printSection(`Stations matching "${query}"`, response.count);
  if (response.stations.length === 0) {
    printEmpty("No stations found.");
    return;
  }

  for (const station of response.stations) {
    printEntry([
      station.name,
      `ID: ${station.id}`,
      `Key: ${station.key}`,
      `Locale: ${station.iso}`,
      station.onRequestStop ? "On-request stop" : "",
    ]);
  }
}

async function handleTrainNumbers(positionals: string[], flags: Map<string, FlagValue>) {
  const query = requireValue(firstPositionalOrFlag(positionals, flags, "query"), "train number query");
  const response = await searchTrainNumbers(query);

  if (flagBool(flags, "json")) {
    printJson(response);
    return;
  }

  printSection(`Train numbers matching "${query}"`, response.count);
  if (response.trainNumbers.length === 0) {
    printEmpty("No train numbers found.");
    return;
  }

  for (const item of response.trainNumbers) {
    printEntry([`Train ${item.number}`, `Key: ${item.key}`]);
  }
}

async function handleRoutes(flags: Map<string, FlagValue>) {
  const from = requireValue(flagString(flags, "from"), "--from");
  const to = requireValue(flagString(flags, "to"), "--to");
  const response = await searchRoutes({
    from,
    to,
    date: normalizeDate(flagString(flags, "date") || todayLocalDate()),
    time: normalizeTime(flagString(flags, "time") || nowLocalTimeRounded()),
    minChange: Number.parseInt(flagString(flags, "min-change") || "3", 10),
    arrival: flagBool(flags, "arrival"),
    direct: flagBool(flags, "direct"),
  });

  if (flagBool(flags, "json")) {
    printJson(response);
    return;
  }

  printSection(`Routes from ${from} to ${to}`, response.count, [
    `Date: ${response.query.date}`,
    `${response.query.departureMode ? "Depart after" : "Arrive by"}: ${response.query.time}`,
    `Min change: ${response.query.minChangeMinutes} min`,
    `Direct only: ${response.query.direct ? "yes" : "no"}`,
    `Ref: ${response.ref}`,
  ]);
  if (response.routes.length === 0) {
    printEmpty("No routes found.");
    return;
  }

  for (const [index, item] of response.routes.entries()) {
    printEntry(
      [
        `${index + 1}. ${item.departureDate} ${item.departureTime} -> ${item.arrivalDate} ${item.arrivalTime}`,
        `${item.departureStation} -> ${item.arrivalStation}`,
        `Train: ${joinNonEmpty([item.category, item.trainNumber])}`,
        `Carrier: ${item.carrier}`,
        `Duration: ${item.duration}`,
        `Transfers: ${item.transfers}`,
        `Price: ${formatTicketPrice(item.ticketPrice, item.ticketPriceCurrency)}`,
        `Platforms: ${fallbackText(item.departurePlatform)} -> ${fallbackText(item.arrivalPlatform)}`,
        item.relation ? `Relation: ${item.relation}` : "",
        item.detailsUrl ? `Details: ${item.detailsUrl}` : "",
      ],
      true,
    );
  }
}

async function handleBoard(positionals: string[], flags: Map<string, FlagValue>, departures: boolean) {
  const stationName = requireValue(firstPositionalOrFlag(positionals, flags, "station"), "station");
  const page = Number.parseInt(flagString(flags, "page") || "1", 10) || 1;
  const response = await getStationBoard({ station: stationName, departures, page });

  if (flagBool(flags, "json")) {
    printJson(response);
    return;
  }

  printSection(`${departures ? "Departures" : "Arrivals"} for ${stationName}`, response.count, [`Page: ${response.page}`]);
  if (response.entries.length === 0) {
    printEmpty(`No ${departures ? "departures" : "arrivals"} found.`);
    return;
  }

  for (const item of response.entries) {
    printEntry([
      `${item.time}  ${delayLabel(item.delayMinutes)}`,
      `Train: ${cleanText(`${item.trainNumber} ${item.trainName}`)}`,
      `Carrier: ${fallbackText(item.carrier)}`,
      `Route: ${fallbackText(item.relationFrom)} -> ${fallbackText(item.relationTo)}`,
      `Platform: ${fallbackText(item.platform)}`,
      `Track: ${fallbackText(item.track)}`,
      item.difficulties.length > 0 ? `Notes: ${item.difficulties.join("; ")}` : "",
    ]);
  }
}

async function handleDelays(flags: Map<string, FlagValue>) {
  const response = await searchDelays({
    station: flagString(flags, "station"),
    from: flagString(flags, "from"),
    to: flagString(flags, "to"),
    arrival: flagBool(flags, "arrival"),
  });

  if (flagBool(flags, "json")) {
    printJson(response);
    return;
  }

  printSection("Delay results", response.count, [
    "station" in response.query
      ? `Station: ${response.query.station}`
      : `Route: ${response.query.from} -> ${response.query.to}`,
    `Mode: ${response.query.departures ? "departures" : "arrivals"}`,
    `Ref: ${response.ref}`,
  ]);
  if (response.delays.length === 0) {
    printEmpty("No delay results found.");
    return;
  }

  for (const [index, item] of response.delays.entries()) {
    printEntry([
      `${index + 1}. ${item.summary}`,
      item.difficulties.length > 0 ? `Difficulties: ${item.difficulties.join("; ")}` : "",
      item.detailsUrl ? `Details: ${item.detailsUrl}` : "",
    ]);
  }
}

async function handleDisruptions(flags: Map<string, FlagValue>) {
  const response = await searchDisruptions({
    station: requireValue(flagString(flags, "station"), "--station"),
    date: normalizeDate(flagString(flags, "date") || todayLocalDate()),
  });

  if (flagBool(flags, "json")) {
    printJson(response);
    return;
  }

  printSection(`Disruptions for ${response.station.name}`, response.count, [
    `Date: ${response.date}`,
    `Ref: ${response.ref}`,
  ]);
  if (response.disruptions.length === 0) {
    printEmpty("No disruption blocks were found on the page.");
    return;
  }

  for (const [index, item] of response.disruptions.entries()) {
    printEntry([`${index + 1}. ${item.title || "Disruption"}`, ...item.body], true);
  }
}

async function handleServer(args: string[]) {
  const [subcommand, ...rest] = args;
  if (!subcommand || subcommand === "help" || subcommand === "--help" || subcommand === "-h") {
    printServerHelp();
    return;
  }

  if (subcommand !== "serve") {
    throw new Error(`Unknown server command: ${subcommand}`);
  }

  const { flags } = parseArgs(rest);
  const host = flagString(flags, "host") || "127.0.0.1";
  const port = Number.parseInt(flagString(flags, "port") || "3000", 10);
  const server = startServer({ host, port });

  console.log(`PKP server listening on http://${server.hostname}:${server.port}`);
  console.log(`OpenAPI document: http://${server.hostname}:${server.port}/openapi.json`);
}

function printHelp() {
  console.log(`pkp cli

Commands:
  stations <query> [--json]
  train-numbers <query> [--json]
  routes --from <station> --to <station> [--date DD.MM.YYYY] [--time HH:MM] [--arrival] [--min-change N] [--direct] [--json]
  departures <station> [--page N] [--json]
  arrivals <station> [--page N] [--json]
  delays --station <station> [--arrival] [--json]
  delays --from <station> --to <station> [--arrival] [--json]
  disruptions --station <station> [--date DD.MM.YYYY] [--json]
  server serve [--host HOST] [--port PORT]
`);
}

function printServerHelp() {
  console.log(`pkp cli server

Commands:
  serve [--host HOST] [--port PORT]
`);
}

function parseArgs(args: string[]) {
  const positionals: string[] = [];
  const flags = new Map<string, FlagValue>();

  for (let index = 0; index < args.length; index++) {
    const current = args[index];
    if (!current) {
      continue;
    }
    if (!current.startsWith("--")) {
      positionals.push(current);
      continue;
    }

    const withoutPrefix = current.slice(2);
    const eqIndex = withoutPrefix.indexOf("=");

    if (eqIndex >= 0) {
      flags.set(withoutPrefix.slice(0, eqIndex), withoutPrefix.slice(eqIndex + 1));
      continue;
    }

    const next = args[index + 1];
    if (!next || next.startsWith("--")) {
      flags.set(withoutPrefix, true);
      continue;
    }

    flags.set(withoutPrefix, next);
    index++;
  }

  return { positionals, flags };
}

function flagString(flags: Map<string, FlagValue>, key: string) {
  const value = flags.get(key);
  return typeof value === "string" ? value : "";
}

function flagBool(flags: Map<string, FlagValue>, key: string) {
  return flags.get(key) === true;
}

function firstPositionalOrFlag(positionals: string[], flags: Map<string, FlagValue>, key: string) {
  return positionals.join(" ") || flagString(flags, key);
}

function printJson(value: unknown) {
  console.log(JSON.stringify(value, null, 2));
}

function printSection(title: string, count?: number, metadata: string[] = []) {
  console.log(title);
  if (typeof count === "number") {
    console.log(`Results: ${count}`);
  }
  for (const line of metadata) {
    if (line) {
      console.log(line);
    }
  }
  console.log("");
}

function printEntry(lines: string[], addGap = false) {
  const visible = lines.map(cleanText).filter(Boolean);
  if (visible.length === 0) {
    return;
  }

  const [first, ...rest] = visible;
  console.log(first);
  for (const line of rest) {
    console.log(`  ${line}`);
  }
  if (addGap) {
    console.log("");
  }
}

function printEmpty(message: string) {
  console.log(message);
}

function delayLabel(delayMinutes: number) {
  return delayMinutes > 0 ? `+${delayMinutes} min` : "on time";
}

function fallbackText(value: string) {
  return cleanText(value) || "n/a";
}

function joinNonEmpty(values: string[]) {
  return values.map(cleanText).filter(Boolean).join(" ");
}

function formatTicketPrice(price: number | null, currency: string | null) {
  if (price === null || !currency) {
    return "N/A";
  }

  return `${price.toFixed(2)} ${currency}`;
}
