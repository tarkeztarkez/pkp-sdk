---
name: pkp
description: Use this skill when working with the pkp SDK CLI or when you need to query portalpasazera.pl data through the global `pkp` command. Covers command syntax, station matching behavior, and machine-readable output with the --json flag.
---

# PKP SDK

Use this skill when you need to run or explain the `pkp` CLI exposed by the SDK.

## Quick start

Use the global `pkp` command:

```bash
pkp help
pkp stations "Warszawa"
pkp stations "Warszawa" --json
```

## Commands

```bash
stations <query> [--json]
train-numbers <query> [--json]
routes --from <station> --to <station> [--date DD.MM.YYYY] [--time HH:MM] [--arrival] [--min-change N] [--direct] [--json]
departures <station> [--page N] [--json]
arrivals <station> [--page N] [--json]
delays --station <station> [--arrival] [--json]
delays --from <station> --to <station> [--arrival] [--json]
disruptions --station <station> [--date DD.MM.YYYY] [--json]
```

## Defaults and behavior

- `routes` defaults to today's local date and the current local time rounded by the CLI.
- `routes` uses departure mode by default. Add `--arrival` to switch to arrive-by mode.
- `routes --min-change` defaults to `3`.
- `departures` and `arrivals` default to `--page 1`.
- `delays` uses departures mode by default. Add `--arrival` for arrivals mode.
- `disruptions` defaults to today's local date.
- Dates must use `DD.MM.YYYY`.
- Times must use `HH:MM`.
- Missing required flags or bad date/time formats cause an error on stderr and exit code `1`.

## Station matching

Commands that need a station name first query the station search endpoint.

- If there is a case-insensitive exact name match, the SDK CLI uses it.
- Otherwise, it takes the first search result.
- If no station matches, the command fails.

For automation, prefer resolving stations first:

```bash
pkp stations "Warszawa" --json
```

Then reuse the exact returned station name in follow-up commands.

## Using `--json`

Prefer `--json` whenever output will be parsed by another tool, another agent, or a script. Without it, the CLI prints a human-readable summary.

General rules:

- JSON is printed with indentation.
- Command metadata is usually included together with `count` and the main result array.
- `routes` and `delays` include a `ref` field from the upstream service.
- Relative detail links are normalized into absolute URLs in JSON output.

Typical patterns:

```bash
pkp routes --from "Warszawa Centralna" --to "Kraków Główny" --json
pkp departures "Warszawa Centralna" --json
pkp delays --station "Warszawa Centralna" --json
```

Pipe to `jq` when you only need part of the payload:

```bash
pkp stations "Warszawa" --json | jq '.stations[].name'
pkp routes --from "Warszawa Centralna" --to "Kraków Główny" --json | jq '.routes[0]'
pkp departures "Warszawa Centralna" --json | jq '.entries[] | {time, trainNumber, delayMinutes}'
```

## JSON shapes

Use these top-level shapes when consuming the SDK CLI programmatically.

### `stations --json`

```json
{
  "query": "Warszawa",
  "count": 2,
  "stations": [
    {
      "id": 1,
      "name": "Warszawa Centralna",
      "key": "...",
      "iso": "pl",
      "onRequestStop": false
    }
  ]
}
```

### `train-numbers --json`

```json
{
  "query": "IC 381",
  "count": 1,
  "trainNumbers": [
    {
      "number": "38100",
      "key": "..."
    }
  ]
}
```

### `routes --json`

```json
{
  "ref": "...",
  "query": {
    "from": "Warszawa Centralna",
    "to": "Kraków Główny",
    "date": "12.03.2026",
    "time": "09:30",
    "departureMode": true,
    "minChangeMinutes": 3,
    "direct": false
  },
  "count": 1,
  "routes": [
    {
      "departureStation": "...",
      "departurePlatform": "...",
      "departureDate": "...",
      "departureTime": "...",
      "arrivalStation": "...",
      "arrivalPlatform": "...",
      "arrivalDate": "...",
      "arrivalTime": "...",
      "carrier": "...",
      "trainNumber": "...",
      "category": "...",
      "relation": "...",
      "duration": "...",
      "transfers": 0,
      "detailsUrl": "https://portalpasazera.pl/..."
    }
  ]
}
```

### `departures --json` and `arrivals --json`

```json
{
  "station": "Warszawa Centralna",
  "board": "departures",
  "page": 1,
  "count": 1,
  "entries": [
    {
      "time": "09:42",
      "delayMinutes": 5,
      "platform": "3",
      "track": "5",
      "carrier": "PKP Intercity",
      "trainName": "...",
      "trainNumber": "...",
      "relationFrom": "...",
      "relationTo": "...",
      "difficulties": []
    }
  ]
}
```

### `delays --json`

```json
{
  "ref": "...",
  "query": {
    "station": "Warszawa Centralna",
    "departures": true
  },
  "count": 1,
  "delays": [
    {
      "summary": "...",
      "detailsUrl": "https://portalpasazera.pl/...",
      "difficulties": []
    }
  ]
}
```

The `query` object is either:

```json
{ "station": "Warszawa Centralna", "departures": true }
```

or:

```json
{ "from": "Warszawa Centralna", "to": "Kraków Główny", "departures": true }
```

### `disruptions --json`

```json
{
  "ref": "...",
  "station": {
    "id": 1,
    "name": "Warszawa Centralna"
  },
  "date": "12.03.2026",
  "count": 1,
  "disruptions": [
    {
      "title": "...",
      "body": ["..."]
    }
  ]
}
```

## Practical guidance

- Use human-readable output when a person is reading the result directly in a terminal.
- Use `--json` for any downstream processing, comparisons, retries, or tests.
- When a workflow depends on stable station identity, query `stations --json` first.
- When you need a deep link back to portalpasazera.pl, prefer `routes --json` or `delays --json` and read `detailsUrl`.
