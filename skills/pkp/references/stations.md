# Stations Reference

Use this file for `stations` and station resolution behavior used by other commands.

## Command

```bash
stations <query> [--json]
```

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

## JSON usage

Prefer `--json` whenever the result will be parsed or reused.

Typical patterns:

```bash
pkp stations "Warszawa" --json
pkp stations "Warszawa" --json | jq '.stations[].name'
```

## JSON shape

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
