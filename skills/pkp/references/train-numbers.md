# Train Numbers Reference

Use this file for `train-numbers`.

## Command

```bash
train-numbers <query> [--json]
```

## JSON usage

Prefer `--json` whenever the result will be parsed or reused.

Typical patterns:

```bash
pkp train-numbers "IC 381" --json
pkp train-numbers "IC 381" --json | jq '.trainNumbers[].number'
```

## JSON shape

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
