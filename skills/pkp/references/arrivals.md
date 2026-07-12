# Arrivals Reference

Use this file for `arrivals`.

## Command

```bash
arrivals <station> [--page N] [--json]
```

## Defaults and behavior

- `arrivals` defaults to `--page 1`.
- If station naming looks ambiguous, resolve the station first with `pkp stations "<query>" --json`.

## JSON usage

Prefer `--json` whenever output will be parsed or linked into another reply.

Typical patterns:

```bash
pkp arrivals "Warszawa Centralna" --json
```

## JSON shape

### `arrivals --json`

```json
{
  "station": "Warszawa Centralna",
  "board": "arrivals",
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
