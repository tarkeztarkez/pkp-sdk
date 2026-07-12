# Live Boards Reference

Use this file for `departures`, `arrivals`, `delays`, and `disruptions`.

## Commands

```bash
departures <station> [--page N] [--json]
arrivals <station> [--page N] [--json]
delays --station <station> [--arrival] [--json]
delays --from <station> --to <station> [--arrival] [--json]
disruptions --station <station> [--date DD.MM.YYYY] [--json]
```

## Defaults and behavior

- `departures` and `arrivals` default to `--page 1`.
- `delays` uses departures mode by default. Add `--arrival` for arrivals mode.
- `disruptions` defaults to today's local date.

## JSON usage

Prefer `--json` whenever output will be parsed or linked into another reply.

Typical patterns:

```bash
pkp departures "Warszawa Centralna" --json
pkp arrivals "Warszawa Centralna" --json
pkp delays --station "Warszawa Centralna" --json
pkp delays --from "Warszawa Centralna" --to "Kraków Główny" --json
pkp disruptions --station "Warszawa Centralna" --date 12.03.2026 --json
pkp departures "Warszawa Centralna" --json | jq '.entries[] | {time, trainNumber, delayMinutes}'
```

## JSON shapes

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

- Use `detailsUrl` from `delays --json` when you need a deep Portal Pasazera link for a delay item.
- Resolve the station first with `pkp stations "<query>" --json` if station naming looks ambiguous.
