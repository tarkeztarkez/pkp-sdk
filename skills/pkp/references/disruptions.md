# Disruptions Reference

Use this file for `disruptions`.

## Command

```bash
disruptions --station <station> [--date DD.MM.YYYY] [--json]
```

## Defaults and behavior

- `disruptions` defaults to today's local date.
- If station naming looks ambiguous, resolve the station first with `pkp stations "<query>" --json`.

## JSON usage

Prefer `--json` whenever output will be parsed or linked into another reply.

Typical patterns:

```bash
pkp disruptions --station "Warszawa Centralna" --date 12.03.2026 --json
```

## JSON shape

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
