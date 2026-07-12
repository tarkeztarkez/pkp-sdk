# Delays Reference

Use this file for `delays`.

## Commands

```bash
delays --station <station> [--arrival] [--json]
delays --from <station> --to <station> [--arrival] [--json]
```

## Defaults and behavior

- `delays` uses departures mode by default. Add `--arrival` for arrivals mode.
- If station naming looks ambiguous, resolve the station first with `pkp stations "<query>" --json`.

## JSON usage

Prefer `--json` whenever output will be parsed or linked into another reply.

Typical patterns:

```bash
pkp delays --station "Warszawa Centralna" --json
pkp delays --from "Warszawa Centralna" --to "Kraków Główny" --json
```

## JSON shape

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

## Practical guidance

- Use `detailsUrl` when you need a deep Portal Pasazera link for a delay item.
