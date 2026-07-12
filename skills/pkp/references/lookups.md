# Lookup Reference

Use this file for `stations`, `train-numbers`, and station resolution behavior.

## Commands

```bash
stations <query> [--json]
train-numbers <query> [--json]
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
pkp train-numbers "IC 381" --json
```

## JSON shapes

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
